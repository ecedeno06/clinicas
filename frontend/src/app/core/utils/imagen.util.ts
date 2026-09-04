// Redimensiona una imagen al vuelo (canvas) y la devuelve como JPEG en
// base64 (data URI), para no guardar fotos de varios MB en la base de
// datos. Usado por avatar de usuario, logo de empresa y foto de paciente.
export function redimensionarImagen(archivo: File, maxDimension: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(lector.error);
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.onload = () => {
        const escala = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = lector.result as string;
    };
    lector.readAsDataURL(archivo);
  });
}
