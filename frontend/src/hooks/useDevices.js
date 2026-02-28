import { useState, useEffect, useCallback } from "react";

export function useDevices() {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState(() => {
    return localStorage.getItem("nomad-device") || null;
  });

  const enumerate = useCallback(async () => {
    // Need permission first to get labels
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // Permission denied — will have empty labels
    }

    const all = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = all.filter((d) => d.kind === "audioinput");
    setDevices(audioInputs);

    // Auto-select saved device or first available
    if (!selectedId || !audioInputs.find((d) => d.deviceId === selectedId)) {
      const first = audioInputs[0]?.deviceId || null;
      setSelectedId(first);
    }
  }, [selectedId]);

  useEffect(() => {
    enumerate();
    navigator.mediaDevices.addEventListener("devicechange", enumerate);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", enumerate);
  }, [enumerate]);

  const select = useCallback((deviceId) => {
    setSelectedId(deviceId);
    localStorage.setItem("nomad-device", deviceId);
  }, []);

  return { devices, selectedId, select, refresh: enumerate };
}
