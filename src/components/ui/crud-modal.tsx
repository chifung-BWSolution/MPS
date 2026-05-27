import { ReactNode } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface CrudModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function CrudModal({ isOpen, onClose, title, children, size = 'md' }: CrudModalProps) {
  if (!isOpen) return null;

  const sizeClass = size === 'sm' ? 'max-w-[400px]' : size === 'lg' ? 'max-w-[700px]' : 'max-w-[550px]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-lg shadow-xl w-full ${sizeClass} mx-4 max-h-[85vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[16px] font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  canDelete: boolean;
  reasons?: string[];
}

export function DeleteConfirmModal({ isOpen, onClose, onConfirm, itemName, canDelete, reasons = [] }: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-[420px] mx-4">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${canDelete ? 'bg-rose-100' : 'bg-amber-100'}`}>
              <AlertTriangle size={20} className={canDelete ? 'text-rose-600' : 'text-amber-600'} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold">{canDelete ? '確認刪除' : '無法刪除'}</h3>
              <p className="text-[12px] text-muted-foreground">{itemName}</p>
            </div>
          </div>

          {canDelete ? (
            <p className="text-[13px] text-muted-foreground mb-6">
              確定要刪除 <span className="font-medium text-foreground">「{itemName}」</span> 嗎？此操作無法撤銷。
            </p>
          ) : (
            <div className="space-y-2 mb-6">
              {reasons.map((reason, idx) => (
                <p key={idx} className="text-[13px] text-amber-800 bg-amber-50 px-3 py-2 rounded border border-amber-200">
                  {reason}
                </p>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80 transition-colors"
            >
              {canDelete ? '取消' : '了解'}
            </button>
            {canDelete && (
              <button
                onClick={onConfirm}
                className="px-4 py-2 text-[13px] font-medium text-white bg-rose-600 rounded-md hover:bg-rose-700 transition-colors"
              >
                確認刪除
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
