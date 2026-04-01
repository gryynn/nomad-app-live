/**
 * System audio capture for meeting recording.
 * Uses getDisplayMedia to capture tab/screen audio and mixes it with microphone.
 */

export function isSystemAudioSupported() {
  return !!navigator.mediaDevices?.getDisplayMedia;
}

/**
 * Acquire a mixed stream combining system audio (from a shared tab/screen)
 * and microphone input.
 *
 * @param {Object} options
 * @param {string} [options.micDeviceId] - Specific mic device ID, or null for default
 * @returns {Promise<{ mixedStream: MediaStream, cleanup: Function } | null>}
 *          null if user cancelled the picker
 */
export async function acquireMeetingStream({ micDeviceId } = {}) {
  let displayStream = null;
  let micStream = null;
  let audioCtx = null;

  try {
    // 1. Request display media — browser shows picker
    // video: true is required by Chrome even if we only want audio
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
  } catch (err) {
    // User cancelled the picker or permission denied
    if (err.name === "NotAllowedError" || err.name === "AbortError") {
      return null;
    }
    throw err;
  }

  // 2. Discard video tracks immediately — we only want audio
  displayStream.getVideoTracks().forEach((t) => t.stop());

  // 3. Check if display stream has audio
  const hasDisplayAudio = displayStream.getAudioTracks().length > 0;
  if (!hasDisplayAudio) {
    console.warn("[MEET] No audio track in display stream — user may not have checked 'Share audio'");
  }

  try {
    // 4. Get microphone stream
    const micConstraints = micDeviceId
      ? { audio: { deviceId: { exact: micDeviceId } } }
      : { audio: true };
    micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
  } catch (err) {
    // Mic permission denied — cleanup display stream
    displayStream.getTracks().forEach((t) => t.stop());
    throw new Error(`Micro non accessible: ${err.message}`);
  }

  // 5. Mix both streams via AudioContext
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const destination = audioCtx.createMediaStreamDestination();

  // Connect mic source
  const micSource = audioCtx.createMediaStreamSource(micStream);
  micSource.connect(destination);

  // Connect display audio source (if available)
  if (hasDisplayAudio) {
    const displaySource = audioCtx.createMediaStreamSource(displayStream);
    displaySource.connect(destination);
  }

  // 6. Cleanup function — stops all tracks and closes AudioContext
  const cleanup = () => {
    try {
      displayStream?.getTracks().forEach((t) => t.stop());
      micStream?.getTracks().forEach((t) => t.stop());
      audioCtx?.close();
    } catch {
      // Ignore cleanup errors
    }
  };

  // Listen for display stream ending (user stops sharing)
  displayStream.getAudioTracks().forEach((track) => {
    track.addEventListener("ended", () => {
      console.log("[MEET] Display audio track ended (user stopped sharing)");
    });
  });

  return {
    mixedStream: destination.stream,
    hasDisplayAudio,
    cleanup,
  };
}
