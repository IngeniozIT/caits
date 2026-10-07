type Mountable = { mount(input: unknown, container: Element): { update(input: unknown): void; destroy(): void } };

export async function mountTemplate(template: unknown, input: unknown = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const instance = (template as Mountable).mount(input, container);
  await settle();
  return { container, instance, async update(next: unknown) { instance.update(next); await settle(); }, async destroy() { instance.destroy(); await settle(); container.remove(); } };
}

export const settle = () => new Promise(resolve => setTimeout(resolve, 20));
export const press = async (element: Element | null | undefined) => { (element as HTMLElement).click(); await settle(); };
