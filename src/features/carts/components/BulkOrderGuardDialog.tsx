"use client";

import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { shopMailtoHref } from "@/lib/contact/links";
import { useStorefrontContact } from "@/providers/ShopContactProvider";
import { useBulkOrderGuardConfig } from "@/providers/BulkOrderGuardProvider";

type BulkOrderGuardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BulkOrderGuardDialog({
  open,
  onOpenChange,
}: BulkOrderGuardDialogProps) {
  const contact = useStorefrontContact();
  const { threshold } = useBulkOrderGuardConfig();
  const mailHref = shopMailtoHref(contact.email);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk order verification required</DialogTitle>
          <DialogDescription className="space-y-2 pt-1 leading-relaxed text-left">
            <p>
              For {threshold}+ quantity, manufacturing/availability confirmation
              is required. Please email us and verify before placing the order.
            </p>
            <p lang="ta">
              {threshold} அல்லது அதற்கு மேற்பட்ட அளவு ஆர்டருக்கு, தயாரிப்பு /
              கிடைப்புத் தகவல் உறுதி அவசியம். ஆர்டர் வைக்கும் முன் தயவுசெய்து
              எங்களுக்கு மின்னஞ்சல் அனுப்பி உறுதிப்படுத்தவும்.
            </p>
          </DialogDescription>
        </DialogHeader>

        {mailHref ? (
          <Button asChild className="w-full">
            <a href={mailHref}>
              <Mail className="mr-2 h-4 w-4" />
              Email {contact.email}
            </a>
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
