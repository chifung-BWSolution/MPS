import { FormEvent, useState } from 'react';
import { INQUIRY_FILE_TYPE_OPTIONS, type InquiryAnswerValue, type InquiryField } from '@/lib/inquiryForm';

const controlClass = 'w-full min-h-11 rounded-md border border-slate-300 bg-white px-3 text-[14px] text-slate-900 outline-none focus:border-sky-600';

function emptyValue(field: InquiryField): InquiryAnswerValue {
  return field.fieldType === 'checkboxes' || field.fieldType === 'file' ? [] : '';
}

export function InquiryFormView({
  formName,
  description,
  websiteName,
  fields,
  submitLabel = '送出',
  labelAlignment = 'top',
  submitAlignment = 'left',
  honeypot = '',
  onHoneypotChange,
  onSubmit,
}: {
  formName: string;
  description?: string;
  websiteName?: string;
  fields: InquiryField[];
  submitLabel?: string;
  labelAlignment?: 'top' | 'left' | 'right';
  submitAlignment?: 'left' | 'center' | 'right';
  honeypot?: string;
  onHoneypotChange?: (value: string) => void;
  onSubmit?: (answers: Record<string, InquiryAnswerValue>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, InquiryAnswerValue>>(() => {
    const initial: Record<string, InquiryAnswerValue> = {};
    for (const field of fields) initial[field.id] = emptyValue(field);
    return initial;
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  function setValue(id: string, value: InquiryAnswerValue) {
    setValues((current) => ({ ...current, [id]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!onSubmit) return;
    setSending(true);
    setError('');
    try {
      let totalFileBytes = 0;
      for (const field of fields.filter((item) => item.fieldType === 'file')) {
        const files = values[field.id];
        const picked = Array.isArray(files) ? files.filter((item): item is File => item instanceof File) : [];
        if (field.required && picked.length === 0) throw new Error(`請選擇檔案：${field.label}`);
        if (field.fileMaxCount > 0 && picked.length > field.fileMaxCount) throw new Error(`「${field.label}」最多上傳 ${field.fileMaxCount} 個檔案`);
        for (const file of picked) {
          totalFileBytes += file.size;
          if (file.size > field.fileMaxSizeMb * 1024 * 1024) {
            throw new Error(`「${field.label}」每個檔案不可大過 ${field.fileMaxSizeMb}MB`);
          }
          const acceptedTypes: string[] = field.fileAccept.length > 0
            ? field.fileAccept
            : INQUIRY_FILE_TYPE_OPTIONS.map((type) => type.id);
          const accepted = acceptedTypes.includes(file.type) ||
            (file.type === 'application/x-zip-compressed' && acceptedTypes.includes('application/zip'));
          if (!accepted) {
            throw new Error(`「${field.label}」不接受 ${file.name} 的檔案格式`);
          }
        }
      }
      if (totalFileBytes > 20 * 1024 * 1024) throw new Error('全部檔案合計不可大過 20MB');
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出失敗');
      setSending(false);
    }
  }

  const alignClass = submitAlignment === 'center'
    ? 'justify-center'
    : submitAlignment === 'right'
      ? 'justify-end'
      : 'justify-start';
  const horizontalLabels = labelAlignment === 'left' || labelAlignment === 'right';

  return (
    <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
      <div>
        <h2 className="text-[22px] font-bold tracking-tight text-slate-950">{formName || '未命名表格'}</h2>
        {websiteName && <p className="mt-1 text-[13px] text-slate-600">{websiteName}</p>}
        {description && <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-slate-700">{description}</p>}
      </div>
      {fields.length === 0 && <p className="text-[14px] text-slate-600">未有欄位。</p>}
      {fields.map((field) => {
        const value = values[field.id] ?? emptyValue(field);
        const label = (
          <span className="text-[14px] font-medium text-slate-900">
            {field.label}
            {field.required && <span className="text-rose-700"> *</span>}
          </span>
        );
        if (field.fieldType === 'section') {
          return (
            <div key={field.id} className="border-b border-slate-200 pb-2 pt-2">
              <h3 className="text-[17px] font-semibold text-slate-950">{field.label}</h3>
              {field.placeholder && <p className="mt-1 text-[13px] leading-5 text-slate-600">{field.placeholder}</p>}
            </div>
          );
        }
        if (field.fieldType === 'hidden') {
          return <input key={field.id} type="hidden" name={field.id} value={field.placeholder} />;
        }
        const rowClass = horizontalLabels
          ? 'grid gap-2 md:grid-cols-[minmax(120px,32%)_1fr] md:items-start'
          : 'block space-y-1';
        const labelClass = horizontalLabels
          ? labelAlignment === 'right' ? 'md:pt-3 md:text-right' : 'md:pt-3'
          : '';
        if (field.fieldType === 'textarea' || field.fieldType === 'address') {
          return (
            <label key={field.id} className={rowClass}>
              <span className={labelClass}>{label}</span>
              <textarea
                className={`${controlClass} min-h-24 py-2`}
                value={typeof value === 'string' ? value : ''}
                placeholder={field.placeholder}
                required={field.required}
                onChange={(event) => setValue(field.id, event.target.value)}
              />
            </label>
          );
        }
        if (field.fieldType === 'select') {
          return (
            <label key={field.id} className={rowClass}>
              <span className={labelClass}>{label}</span>
              <select
                className={controlClass}
                value={typeof value === 'string' ? value : ''}
                required={field.required}
                onChange={(event) => setValue(field.id, event.target.value)}
              >
                <option value="">請選擇</option>
                {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          );
        }
        if (field.fieldType === 'file') {
          const picked = Array.isArray(value) ? value.filter((item): item is File => item instanceof File) : [];
          const acceptedOptions = field.fileAccept.length > 0
            ? INQUIRY_FILE_TYPE_OPTIONS.filter((type) => field.fileAccept.includes(type.id))
            : INQUIRY_FILE_TYPE_OPTIONS;
          const accept = acceptedOptions.flatMap((type) => [type.id, ...type.extensions]).join(',');
          return (
            <label key={field.id} className={rowClass}>
              <span className={labelClass}>{label}</span>
              <span>
                <input
                  className={`${controlClass} py-2 file:mr-3 file:rounded-md file:border-0 file:bg-sky-50 file:px-3 file:py-1 file:text-[13px] file:font-medium file:text-sky-900`}
                  type="file"
                  multiple={field.fileMaxCount !== 1}
                  accept={accept}
                  required={field.required && picked.length === 0}
                  onChange={(event) => setValue(field.id, Array.from(event.target.files || []))}
                />
                <span className="mt-1 block text-[12px] leading-5 text-slate-600">
                  {field.fileMaxCount > 0 ? `最多 ${field.fileMaxCount} 個` : '數量不限'}，每個不超過 {field.fileMaxSizeMb}MB；全部檔案合計不超過 20MB。
                </span>
                {picked.length > 0 && (
                  <span className="mt-1 block text-[12px] text-slate-700">
                    已選：{picked.map((file) => file.name).join('、')}
                  </span>
                )}
              </span>
            </label>
          );
        }
        if (field.fieldType === 'radio' || field.fieldType === 'checkboxes') {
          const picked = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
          return (
            <fieldset key={field.id} className={rowClass}>
              <legend className={labelClass}>{label}</legend>
              <div className="space-y-1">
                {field.options.map((option) => (
                  <label key={option} className="flex min-h-11 items-center gap-2 text-[14px] text-slate-900">
                    <input
                      type={field.fieldType === 'radio' ? 'radio' : 'checkbox'}
                      name={field.id}
                      className="h-4 w-4"
                      required={field.fieldType === 'radio' && field.required}
                      checked={field.fieldType === 'radio' ? value === option : picked.includes(option)}
                      onChange={() => {
                        if (field.fieldType === 'radio') {
                          setValue(field.id, option);
                          return;
                        }
                        setValue(field.id, picked.includes(option) ? picked.filter((item) => item !== option) : [...picked, option]);
                      }}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }
        if (field.fieldType === 'checkbox' || field.fieldType === 'terms') {
          return (
            <label key={field.id} className="flex min-h-11 items-start gap-3 rounded-md border border-slate-200 px-3 py-2 text-[14px] leading-6 text-slate-900">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0"
                required={field.required || field.fieldType === 'terms'}
                checked={value === 'yes'}
                onChange={(event) => setValue(field.id, event.target.checked ? 'yes' : '')}
              />
              <span>
                {field.label}
                {(field.required || field.fieldType === 'terms') && <span className="text-rose-700"> *</span>}
                {field.placeholder && <span className="mt-0.5 block text-[13px] text-slate-600">{field.placeholder}</span>}
              </span>
            </label>
          );
        }
        const inputType = field.fieldType === 'email' || field.fieldType === 'phone' || field.fieldType === 'number' || field.fieldType === 'date' || field.fieldType === 'website'
          ? (field.fieldType === 'phone' ? 'tel' : field.fieldType === 'website' ? 'url' : field.fieldType)
          : 'text';
        return (
          <label key={field.id} className={rowClass}>
            <span className={labelClass}>{label}</span>
            <input
              className={controlClass}
              type={inputType}
              value={typeof value === 'string' ? value : ''}
              placeholder={field.placeholder}
              required={field.required}
              onChange={(event) => setValue(field.id, event.target.value)}
            />
          </label>
        );
      })}
      {onHoneypotChange && (
        <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label>
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(event) => onHoneypotChange(event.target.value)}
            />
          </label>
        </div>
      )}
      {onSubmit && fields.length > 0 && (
        <div className={`flex ${alignClass}`}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-md bg-sky-700 px-5 text-[14px] font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={sending}
          >
            {sending ? '送出中…' : submitLabel}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-[14px] text-rose-800">{error}</p>}
    </form>
  );
}
