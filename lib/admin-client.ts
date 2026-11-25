export async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    window.location.replace("/admin/login");
    throw new Error("Сессия завершилась. Перенаправляем на страницу входа.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      response.ok
        ? "Сервер вернул некорректный ответ."
        : "Не удалось выполнить действие. Ошибка сервера: " + response.status + ".",
    );
  }

  if (!response.ok) {
    const message = (
      payload !== null
      && typeof payload === "object"
      && "error" in payload
      && typeof payload.error === "string"
    )
      ? payload.error
      : "Не удалось выполнить действие.";
    throw new Error(message);
  }
  return payload as T;
}

export async function uploadAdminImage(file: File): Promise<string> {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/admin/upload", { method: "POST", body: form });
  return (await readJson<{ url: string }>(response)).url;
}
