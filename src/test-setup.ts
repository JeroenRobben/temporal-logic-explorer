// jsdom (as of v24) lacks Blob/File .text(); Header's export/import uses it.
function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
if (typeof Blob.prototype.text !== 'function') {
  (Blob.prototype as unknown as { text(): Promise<string> }).text = function (this: Blob) {
    return readBlobAsText(this);
  };
}
