/** The error of a refused HTTP request: the `detail` of its problem when it is text, otherwise its status. */
export async function failureOf(response: Response): Promise<Error> {
  const fallback = `HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { detail?: unknown } | null;
    return new Error(typeof body?.detail === "string" ? body.detail : fallback);
  } catch {
    return new Error(fallback);
  }
}
