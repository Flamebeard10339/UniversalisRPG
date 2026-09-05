export const DOWNLOAD_TYPE = 'text/plain;charset=utf-8';

export function handOver(name: string, text: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const at = URL.createObjectURL(new Blob([text], { type: DOWNLOAD_TYPE }));
  const link = document.createElement('a');
  link.href = at;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(at);
}
