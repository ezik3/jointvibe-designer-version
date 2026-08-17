import { FileBadge, Landmark, ReceiptText } from "lucide-react";

export const BUSINESS_DOCUMENT_TYPES = [
  {
    id: "business_registration",
    label: "Business registration",
    description: "Official business registration document",
    icon: FileBadge,
  },
  {
    id: "liquor_license",
    label: "Venue licence",
    description: "Hospitality or liquor licence",
    icon: ReceiptText,
  },
  {
    id: "tax_certificate",
    label: "Tax registration",
    description: "Government tax or GST registration",
    icon: Landmark,
  },
] as const;

export type BusinessDocumentType = (typeof BUSINESS_DOCUMENT_TYPES)[number]["id"];

export function isBusinessDocumentType(value: string | null): value is BusinessDocumentType {
  return BUSINESS_DOCUMENT_TYPES.some((document) => document.id === value);
}
