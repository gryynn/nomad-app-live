# Storage backend — choisir où vivent les fichiers audio

NOMAD abstrait le stockage de fichiers derrière une interface `StorageBackend`.
Ça vous permet de choisir où vivent vos audios sans toucher au code.

## Choisir un driver

Réglez la variable d'env `STORAGE_DRIVER` dans votre `.env` :

| Driver | Cas d'usage | Pré-requis |
|---|---|---|
| `local` | Self-host minimal, 0 service externe | Volume Docker |
| `nextcloud` | Vous self-hostez déjà Nextcloud | URL + app password |
| `s3` | AWS S3 / Cloudflare R2 / Backblaze B2 / MinIO | bucket + creds |
| `supabase` | Compatibilité legacy / vous payez déjà Supabase Pro | clés Supabase |

## Driver `local` (recommandé pour OSS)

Audio stocké dans `./data/audio/` à l'intérieur du container, monté sur un volume host.

```env
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=/app/data/audio
PUBLIC_BACKEND_URL=https://your-domain.tld
```

Dans `docker-compose.yml`, ajoutez le mount :
```yaml
services:
  nomad-api:
    volumes:
      - ./nomad-data/audio:/app/data/audio
```

Pensez à backuper `./nomad-data/audio/` au même rythme que votre DB.

## Driver `nextcloud`

WebDAV via app password (revoquable, bypasse 2FA proprement).

1. Sur votre Nextcloud → **Paramètres > Sécurité > Mots de passe de connexion**
2. Créez un nouveau "Nom de l'app password" (ex: `nomad-api`)
3. Copiez le mot de passe généré

```env
STORAGE_DRIVER=nextcloud
NEXTCLOUD_URL=https://your-nextcloud.tld
NEXTCLOUD_USER=your_login
NEXTCLOUD_PASSWORD=app_password_from_step_3
NEXTCLOUD_BASE_PATH=nomad-audio
PUBLIC_BACKEND_URL=https://your-nomad-api.tld
```

Le dossier `nomad-audio/` sera créé automatiquement à la racine du user.

## Driver `s3`

Compatible AWS S3, Cloudflare R2, Backblaze B2, MinIO, Wasabi, etc.

```env
STORAGE_DRIVER=s3
S3_BUCKET=your-bucket
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_REGION=auto                 # R2: "auto", AWS: "us-east-1"...
S3_ENDPOINT_URL=https://...    # omit for AWS S3
S3_FORCE_PATH_STYLE=false      # true for MinIO
PUBLIC_BACKEND_URL=https://your-nomad-api.tld
```

## Driver `supabase` (legacy)

Reste fonctionnel pour la compat. Vous devez avoir un projet Supabase avec
les buckets `nomad-audio` et `nomad-audio-chunks` (privés, RLS configurées).

```env
STORAGE_DRIVER=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=...
```

## Sécurité — `audio_url` et signed tokens

Quand le driver n'est pas Supabase, `audio_url` stocké en DB est de la forme :

```
https://your-nomad-api.tld/api/audio/{session_id}
```

Cette URL passe par votre backend, qui valide soit :

- Un Bearer token de l'utilisateur connecté (le frontend en a un dans le localStorage)
- Un token signé court (`?token=eyJ...`) injecté par le backend lui-même quand il
  passe l'URL à un service externe (Groq, Deepgram). Token = JWT HS256, scope
  `audio:read`, lié à un `session_id` précis, expiration ~1h.

Pour activer le mode strict (refuser les requêtes anonymes) :
```env
AUDIO_TOKEN_REQUIRED=true
AUDIO_TOKEN_TTL_MINUTES=60
```

## Ajouter un nouveau driver

1. Créez `backend/app/services/storage/your_driver.py` qui hérite de `StorageBackend`
2. Implémentez les 7 méthodes (`upload`, `download`, `stream`, `delete`, `exists`, `size`, `list_prefix`)
3. Ajoutez le dispatch dans `factory.py`
4. Ajoutez vos variables dans `.env.example`
5. Écrivez un test dans `backend/tests/test_storage_drivers.py`

## Migration de données existantes

Si vous changez de driver, les anciens `audio_url` continuent de pointer vers
l'ancien storage. Pour migrer :

1. Téléchargez chaque fichier depuis l'ancien backend
2. Uploadez-le vers le nouveau (clé `audio/{user}/{id}.{ext}`)
3. Mettez à jour `app_nomad.sessions.storage_key` avec la clé propre au nouveau backend
4. Mettez à jour `audio_url` (pour les drivers non-supabase, c'est `{PUBLIC_BACKEND_URL}/api/audio/{session_id}`)

Voir `~/backups/supabase/backfill-storage-key.py` pour un exemple de script de
backfill `storage_key` à partir d'`audio_url` legacy.

## Lancer les tests

```bash
docker compose exec nomad-api pytest tests/ -v
```

21 tests couvrent : drivers (local FS), tokens audio (JWT), router audio (TestClient avec Range).
