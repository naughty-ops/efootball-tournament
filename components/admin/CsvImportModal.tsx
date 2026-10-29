'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  parseAndValidateParticipantCsv,
  generateParticipantCsvTemplate,
  CsvValidationResult,
} from '@/lib/csv/participantCsvParser';
import { batchAddParticipants } from '@/services/participantService';
import type { Participant } from '@/types/database';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tournamentId: string;
  existingParticipants: Participant[];
  maxParticipants: number;
}

export function CsvImportModal({
  isOpen,
  onClose,
  onSuccess,
  tournamentId,
  existingParticipants,
  maxParticipants,
}: CsvImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvResult, setCsvResult] = useState<CsvValidationResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const resetStateAndClose = () => {
    setSelectedFile(null);
    setCsvResult(null);
    setImportError(null);
    onClose();
  };

  const handleDownloadTemplate = () => {
    const templateContent = generateParticipantCsvTemplate();
    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'efootball_participants_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setImportError('Please select a valid .csv file.');
      return;
    }

    setSelectedFile(file);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        const result = parseAndValidateParticipantCsv(content, existingParticipants, maxParticipants);
        setCsvResult(result);
      }
    };
    reader.readAsText(file);
  };

  const handleImportExecute = async () => {
    if (!csvResult || csvResult.validCount === 0) return;
    setIsImporting(true);
    setImportError(null);

    try {
      const validInputs = csvResult.rows
        .filter((r) => r.isValid && r.parsedInput !== null)
        .map((r) => r.parsedInput!);

      await batchAddParticipants(tournamentId, validInputs, maxParticipants);
      onSuccess();
      resetStateAndClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'CSV import failed';
      setImportError(msg);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={resetStateAndClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-3xl bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 z-10 space-y-6 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[#1D1DE0] border border-slate-200 shadow-xs">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-[#0A0D14] uppercase tracking-tight">Bulk CSV Participant Import</h3>
              <p className="text-xs text-[#334155] font-medium mt-0.5">
                Upload a CSV roster file to add multiple players at once.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDownloadTemplate}
              className="text-xs font-bold gap-2 rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-100 hover:border-slate-400 text-[#0A0D14] shadow-xs cursor-pointer h-9 px-3.5 transition-all"
            >
              <Download className="h-3.5 w-3.5 text-[#1D1DE0]" />
              <span>Download Template</span>
            </Button>
            <button
              type="button"
              onClick={resetStateAndClose}
              className="text-slate-400 hover:text-[#0A0D14] p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Upload Dropzone */}
        <div className="space-y-4">
          <div className="border-2 border-dashed border-slate-300 hover:border-[#1D1DE0] rounded-2xl p-6 text-center transition-colors bg-[#F8FAFC]">
            <Upload className="h-8 w-8 text-[#1D1DE0] mx-auto mb-2" />
            <p className="text-sm font-black text-[#0A0D14]">Select CSV file from your device</p>
            <p className="text-xs text-[#334155] font-medium mt-1 mb-4">
              Must include headers: <code className="bg-white px-2 py-0.5 rounded border border-slate-300 font-mono font-bold text-[#0A0D14]">username, real_name, contact_info, seed_number</code>
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-file-upload-input"
            />
            <label htmlFor="csv-file-upload-input">
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="rounded-xl font-bold text-xs h-10 px-6 border-2 border-[#1D1DE0] bg-[#1D1DE0] text-white hover:bg-[#1515B0] cursor-pointer shadow-sm transition-all"
              >
                <span>{selectedFile ? selectedFile.name : 'Choose CSV File'}</span>
              </Button>
            </label>
          </div>
        </div>

        {/* Error Banner */}
        {importError && (
          <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{importError}</span>
          </div>
        )}

        {/* Validation Preview Results */}
        {csvResult && (
          <div className="flex-1 min-h-0 flex flex-col space-y-3">
            {/* Stats Summary Bar */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="flex items-center gap-4">
                <span className="font-extrabold text-[#0A0D14]">
                  Valid: <span className="text-[#00C853] font-black">{csvResult.validCount}</span>
                </span>
                <span className="font-extrabold text-[#0A0D14]">
                  Invalid: <span className="text-destructive font-black">{csvResult.invalidCount}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={csvResult.exceedsCapacity ? 'destructive' : 'default'} className={csvResult.exceedsCapacity ? 'text-xs' : 'text-xs bg-[#1D1DE0] text-white font-bold'}>
                  Capacity: {existingParticipants.length + csvResult.validCount} / {maxParticipants}
                </Badge>
              </div>
            </div>

            {/* Capacity Warning Alert */}
            {csvResult.exceedsCapacity && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs font-semibold flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  This CSV file exceeds the tournament capacity limit of {maxParticipants} participants (Current: {existingParticipants.length}, Available: {csvResult.availableCapacity}). Please remove excess rows from the file before importing.
                </span>
              </div>
            )}

            {/* Preview Data Table */}
            <div className="flex-1 overflow-y-auto no-scrollbar rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F1F5F9] text-[#0A0D14] font-black border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-3 w-12 text-center text-[#0A0D14] font-black">Row</th>
                    <th className="p-3 text-[#0A0D14] font-black">Username</th>
                    <th className="p-3 text-[#0A0D14] font-black">Real Name</th>
                    <th className="p-3 text-[#0A0D14] font-black">Contact</th>
                    <th className="p-3 w-16 text-[#0A0D14] font-black">Seed</th>
                    <th className="p-3 text-[#0A0D14] font-black">Status / Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {csvResult.rows.map((row) => (
                    <tr key={row.rowIndex} className={row.isValid ? 'hover:bg-slate-50/80' : 'bg-red-50/50'}>
                      <td className="p-3 text-center font-mono text-slate-500 font-bold">{row.rowIndex}</td>
                      <td className="p-3 font-bold text-[#0A0D14]">{row.rawUsername || '-'}</td>
                      <td className="p-3 text-slate-600 font-medium">{row.rawRealName || '-'}</td>
                      <td className="p-3 text-slate-600 font-medium">{row.rawContactInfo || '-'}</td>
                      <td className="p-3 font-mono font-bold text-[#1D1DE0]">{row.rawSeedNumber || '-'}</td>
                      <td className="p-3">
                        {row.isValid ? (
                          <Badge variant="secondary" className="gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Valid
                          </Badge>
                        ) : (
                          <div className="text-destructive font-medium flex items-center gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-1">{row.errorMessage}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <Button
            type="button"
            variant="ghost"
            onClick={resetStateAndClose}
            disabled={isImporting}
            className="rounded-xl text-xs font-black h-11 px-5 border-2 border-slate-300 bg-white text-[#0A0D14] hover:bg-slate-100 hover:border-slate-400 transition-all shadow-xs cursor-pointer"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={handleImportExecute}
            disabled={!csvResult || csvResult.validCount === 0 || csvResult.exceedsCapacity || isImporting}
            className="rounded-xl font-black text-xs h-11 px-6 bg-[#00C853] hover:bg-[#00B048] text-[#072418] border-none gap-2 shadow-sm uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[#072418]" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 text-[#072418]" />
                <span>Import {csvResult ? csvResult.validCount : 0} Valid Participants</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
