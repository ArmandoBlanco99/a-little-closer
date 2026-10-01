// Local Python transport. The production build substitutes transport-netlify.js.
export async function gameRequest(op, body, session, options = {}) {
  const response = await fetch("/api/" + op, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: "Bearer " + session.token } : {}),
    },
    body: JSON.stringify(body),
    ...options,
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "Something went wrong. Please try again.");
  return data;
}
export function subscribe(session) {
  return new EventSource(
    "/api/events?" +
      new URLSearchParams({ code: session.code, token: session.token }),
  );
}
