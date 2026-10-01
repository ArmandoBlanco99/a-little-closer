const endpoint = "/.netlify/functions/game";
export async function gameRequest(op, body, session, options = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: "Bearer " + session.token } : {}),
    },
    body: JSON.stringify({ ...body, op }),
    ...options,
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "Something went wrong. Please try again.");
  return data;
}
export function subscribe(session) {
  let stopped = false,
    timer,
    controller;
  const stream = {
    close() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      gameRequest("leave", { code: session.code }, session, {
        keepalive: true,
      }).catch(() => {});
    },
  };
  async function poll() {
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let interval = 1000;
    try {
      const state = await gameRequest(
        "state",
        { code: session.code },
        session,
        { signal: controller.signal },
      );
      if (stopped) return;
      stream.onopen?.();
      stream.onmessage?.({ data: JSON.stringify(state) });
      interval =
        state.phase === "playing" && !state.paused
          ? state.stage === 0
            ? 100
            : 600
          : state.phase === "victory"
            ? 1500
            : 800;
    } catch (error) {
      if (!stopped) stream.onerror?.(error);
    } finally {
      clearTimeout(timeout);
      if (!stopped) timer = setTimeout(poll, interval);
    }
  }
  timer = setTimeout(poll, 0);
  return stream;
}
