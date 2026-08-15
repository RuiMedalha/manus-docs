export type FolderRuleInput = {
  documentType?: string | null;
  entityName?: string | null;
  emailDomain?: string | null;
  keyword?: string | null;
  folderTemplate: string;
};

export type DocumentFolderData = {
  documentType: string;
  entityName?: string | null;
  documentDate?: string | null;
  origin?: string | null;
  sourceAddress?: string | null;
  filename?: string | null;
  documentNumber?: string | null;
};

function normaliseText(value?: string | null) {
  return value?.trim().toLocaleLowerCase("pt-PT") ?? "";
}

function cleanSegment(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "Sem entidade";
}

export function ruleMatchesDocument(rule: FolderRuleInput, document: DocumentFolderData) {
  if (rule.documentType && rule.documentType !== document.documentType) return false;
  if (rule.entityName && !normaliseText(document.entityName).includes(normaliseText(rule.entityName))) return false;
  const emailDomain = normaliseText(document.sourceAddress).split("@").pop() ?? "";
  if (rule.emailDomain && emailDomain !== normaliseText(rule.emailDomain).replace(/^@/, "")) return false;
  const documentText = [document.entityName, document.filename, document.documentNumber].map(normaliseText).join(" ");
  if (rule.keyword && !documentText.includes(normaliseText(rule.keyword))) return false;
  return true;
}

export function applyFolderTemplate(template: string, document: DocumentFolderData) {
  const date = document.documentDate ? new Date(`${document.documentDate}T12:00:00`) : new Date();
  const variables: Record<string, string> = {
    Ano: String(date.getFullYear()),
    Mes: String(date.getMonth() + 1).padStart(2, "0"),
    Tipo: cleanSegment(document.documentType.replace(/_/g, " ")),
    Entidade: cleanSegment(document.entityName ?? "Sem entidade"),
  };
  return template.replace(/\{(Ano|Mes|Tipo|Entidade)\}/g, (_, token: keyof typeof variables) => variables[token]);
}
