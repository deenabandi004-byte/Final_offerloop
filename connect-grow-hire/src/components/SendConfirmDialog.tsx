import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

/**
 * Shared hard confirm dialog shown before any outreach send. Sends are
 * irreversible, so this gate fires before a single email goes out.
 *
 * Built to be reused: the Find search uses it today, and a future "send from
 * tracker" feature should reuse this same component rather than rolling its own
 * confirm. Keep it generic (count plus optional copy overrides) for that reason.
 */
interface SendConfirmDialogProps {
  open: boolean;
  /** Number of emails that will be sent. Drives the default copy. */
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  /** When true, the confirm button shows a sending state and is disabled. */
  loading?: boolean;
  /** Optional copy overrides for reuse in other surfaces. */
  title?: string;
  description?: string;
  confirmLabel?: string;
}

export function SendConfirmDialog({
  open,
  count,
  onConfirm,
  onCancel,
  loading,
  title,
  description,
  confirmLabel,
}: SendConfirmDialogProps) {
  const noun = count === 1 ? "email" : "emails";
  const resolvedTitle = title || `Send ${count} ${noun} now?`;
  const resolvedDescription =
    description ||
    `This sends real ${noun} to ${count} ${count === 1 ? "contact" : "contacts"} from your Gmail account. This cannot be undone.`;
  const resolvedConfirmLabel = confirmLabel || (loading ? "Sending..." : `Send ${count} ${noun}`);

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !loading) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{resolvedTitle}</AlertDialogTitle>
          <AlertDialogDescription>{resolvedDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(e) => {
              // Keep the dialog under our control: prevent the default close so
              // the caller decides when to dismiss (e.g. after the send starts).
              e.preventDefault();
              onConfirm();
            }}
            style={{ background: "#4A60A8" }}
          >
            {resolvedConfirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default SendConfirmDialog;
