export async function getAuthorizedDocumentUrl(fileKey: string, getSignedUrl: (key: string) => Promise<string>) {
  const url = await getSignedUrl(fileKey);
  if (!url) throw new Error("Não foi possível gerar um endereço seguro para o documento.");
  return url;
}
