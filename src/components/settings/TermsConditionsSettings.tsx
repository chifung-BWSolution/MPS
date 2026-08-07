import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Plus, Edit, Trash2, X, Save, FileText, Star, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import {
  termsTemplates as initialTemplates,
  TermsTemplate,
  quotationTypes,
} from '@/data/quotationData';

export function TermsConditionsSettings() {
  const [templates, setTemplates] = useState<TermsTemplate[]>(initialTemplates);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TermsTemplate | null>(null);
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Group templates by quotation type
  const groupedTemplates: Record<string, TermsTemplate[]> = {};
  
  // Add 'all' group first
  groupedTemplates['all'] = templates.filter(t => t.quotationTypeId === 'all');
  
  // Add each quotation type
  quotationTypes.forEach(qt => {
    groupedTemplates[qt.id] = templates.filter(t => t.quotationTypeId === qt.id);
  });

  const getTypeName = (typeId: string) => {
    if (typeId === 'all') return '通用條款（所有類型適用）';
    const qt = quotationTypes.find(t => t.id === typeId);
    return qt ? `${qt.name} (${qt.nameEn})` : '未知';
  };

  const handleAdd = (quotationTypeId?: string) => {
    setEditingTemplate(null);
    setIsModalOpen(true);
  };

  const handleEdit = (template: TermsTemplate) => {
    setEditingTemplate(template);
    setIsModalOpen(true);
  };

  const handleDuplicate = (template: TermsTemplate) => {
    const newTemplate: TermsTemplate = {
      ...template,
      id: `tt${Date.now()}`,
      name: `${template.name} (副本)`,
      isDefault: false,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
    };
    setTemplates(prev => [...prev, newTemplate]);
  };

  const handleDelete = (templateId: string) => {
    setTemplates(prev => prev.filter(t => t.id !== templateId));
    setDeleteConfirmId(null);
  };

  const handleSetDefault = (template: TermsTemplate) => {
    setTemplates(prev =>
      prev.map(t => {
        if (t.quotationTypeId === template.quotationTypeId) {
          return { ...t, isDefault: t.id === template.id };
        }
        return t;
      })
    );
  };

  const handleSave = (data: Omit<TermsTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingTemplate) {
      setTemplates(prev =>
        prev.map(t =>
          t.id === editingTemplate.id
            ? { ...t, ...data, updatedAt: new Date().toISOString().split('T')[0] }
            : t
        )
      );
    } else {
      const newTemplate: TermsTemplate = {
        ...data,
        id: `tt${Date.now()}`,
        createdAt: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString().split('T')[0],
      };
      setTemplates(prev => [...prev, newTemplate]);
    }
    setIsModalOpen(false);
    setEditingTemplate(null);
  };

  const toggleExpand = (typeId: string) => {
    setExpandedTypeId(prev => (prev === typeId ? null : typeId));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-bold">條款及細則範本</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            管理各報價類型的條款範本。報價時可選擇適用範本，亦可在報價詳情頁直接編輯。
          </p>
        </div>
        <button
          onClick={() => handleAdd()}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]"
        >
          <Plus size={14} />新增條款範本
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-3">
          <p className="text-[11px] text-muted-foreground">總條款範本</p>
          <p className="text-[20px] font-bold text-teal-700">{templates.length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-3">
          <p className="text-[11px] text-muted-foreground">適用類型數</p>
          <p className="text-[20px] font-bold">{Object.keys(groupedTemplates).filter(k => groupedTemplates[k].length > 0).length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-3">
          <p className="text-[11px] text-muted-foreground">預設範本</p>
          <p className="text-[20px] font-bold text-amber-600">{templates.filter(t => t.isDefault).length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-3">
          <p className="text-[11px] text-muted-foreground">通用範本</p>
          <p className="text-[20px] font-bold text-blue-600">{templates.filter(t => t.quotationTypeId === 'all').length}</p>
        </div>
      </div>

      {/* Grouped Templates */}
      <div className="space-y-3">
        {Object.entries(groupedTemplates).map(([typeId, typeTemplates]) => {
          if (typeTemplates.length === 0 && typeId !== 'all') return null;
          const isExpanded = expandedTypeId === typeId;

          return (
            <div
              key={typeId}
              className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden"
            >
              {/* Type Header */}
              <div
                className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => toggleExpand(typeId)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                  <div className="w-8 h-8 bg-teal-50 rounded flex items-center justify-center">
                    <FileText size={14} className="text-teal-600" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold">{getTypeName(typeId)}</h4>
                    <span className="text-[11px] text-muted-foreground">{typeTemplates.length} 個條款範本</span>
                  </div>
                </div>
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded',
                  typeId === 'all' ? 'bg-blue-50 text-blue-700' : 'bg-teal-50 text-teal-700'
                )}>
                  {typeId === 'all' ? '通用' : '專用'}
                </span>
              </div>

              {/* Template List */}
              {isExpanded && (
                <div className="border-t border-[rgba(13,26,45,0.06)] px-5 py-3 space-y-2.5">
                  {typeTemplates.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground text-center py-4">
                      此類型暫無條款範本。點擊「新增條款範本」建立。
                    </p>
                  ) : (
                    typeTemplates.map(template => (
                      <div
                        key={template.id}
                        className="border border-[rgba(13,26,45,0.06)] rounded-md p-3.5 hover:border-teal-200 transition-colors group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <h5 className="text-[13px] font-medium">{template.name}</h5>
                            {template.isDefault && (
                              <span className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                                <Star size={9} />預設
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!template.isDefault && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSetDefault(template); }}
                                className="p-1 rounded hover:bg-amber-50 text-muted-foreground hover:text-amber-600 transition-colors"
                                title="設為預設"
                              >
                                <Star size={13} />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDuplicate(template); }}
                              className="p-1 rounded hover:bg-blue-50 text-muted-foreground hover:text-blue-600 transition-colors"
                              title="複製"
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEdit(template); }}
                              className="p-1 rounded hover:bg-teal-50 text-muted-foreground hover:text-teal-600 transition-colors"
                              title="編輯"
                            >
                              <Edit size={13} />
                            </button>
                            {deleteConfirmId === template.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                                  className="px-1.5 py-0.5 text-[10px] bg-rose-600 text-white rounded hover:bg-rose-700"
                                >
                                  確定
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                                  className="px-1.5 py-0.5 text-[10px] border border-border rounded hover:bg-muted"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(template.id); }}
                                className="p-1 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-600 transition-colors"
                                title="刪除"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded px-3 py-2 text-[11px] text-slate-600 leading-relaxed whitespace-pre-line max-h-[100px] overflow-y-auto">
                          {template.content}
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                          <span>建立：{template.createdAt}</span>
                          <span>更新：{template.updatedAt}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <TermsTemplateModal
          editingTemplate={editingTemplate}
          onSave={handleSave}
          onClose={() => { setIsModalOpen(false); setEditingTemplate(null); }}
        />
      )}
    </div>
  );
}

function TermsTemplateModal({ editingTemplate, onSave, onClose }: {
  editingTemplate: TermsTemplate | null;
  onSave: (data: Omit<TermsTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(editingTemplate?.name || '');
  const [content, setContent] = useState(editingTemplate?.content || '');
  const [quotationTypeId, setQuotationTypeId] = useState(editingTemplate?.quotationTypeId || 'all');
  const [isDefault, setIsDefault] = useState(editingTemplate?.isDefault || false);

  const handleSubmit = () => {
    if (!name.trim() || !content.trim()) return;
    onSave({
      name: name.trim(),
      content: content.trim(),
      quotationTypeId,
      isDefault,
    });
  };

  return (
    <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[600px] p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[18px] font-bold">{editingTemplate ? '編輯條款範本' : '新增條款範本'}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">範本名稱 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              placeholder="如：標準網站設計條款"
            />
          </div>

          {/* Quotation Type */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">適用報價類型 *</label>
            <select
              value={quotationTypeId}
              onChange={(e) => setQuotationTypeId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
            >
              <option value="all">通用（所有類型適用）</option>
              {quotationTypes.map(qt => (
                <option key={qt.id} value={qt.id}>{qt.name} ({qt.nameEn})</option>
              ))}
            </select>
          </div>

          {/* Content */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">條款內容 *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 min-h-[180px] leading-relaxed bg-white"
              placeholder="每行為一條條款，例如：&#10;1. 本報價有效期為30天。&#10;2. 設計稿修改不超過3次。&#10;3. 專案完成後提供30天免費維護。"
            />
            <p className="text-[10px] text-muted-foreground mt-1">每行為一條條款，建議以數字編號開頭。</p>
          </div>

          {/* Is Default */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded border-border text-teal-600 focus:ring-teal-600"
            />
            <label htmlFor="isDefault" className="text-[12px] font-medium text-muted-foreground">
              設為此類型的預設條款（建立新報價時自動套用）
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border/50">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-md text-[13px] font-medium hover:bg-muted/50 transition-colors">取消</button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !content.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={13} />
            {editingTemplate ? '儲存變更' : '新增範本'}
          </button>
        </div>
      </div>
    </div>
  );
}
