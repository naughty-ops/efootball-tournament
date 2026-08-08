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
        className="fixed inset-0 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={resetStateAndClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-3xl bg-white rounded-3xl border border-border shadow-2xl p-6 z-10 space-y-6 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-primary">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-[#0B3323]">Bulk CSV Participant Import</h3>
              <p className="text-xs text-muted-foreground">
                Upload a CSV roster file to add multiple players at once.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="text-xs font-bold gap-1.5 rounded-xl border-border hover:bg-secondary text-[#0B3323]"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              <span>Download Template</span>
            </Button>
            <button
              onClick={resetStateAndClose}
              className="text-muted-foreground hover:text-[#0B3323] p-1.5 rounded-xl transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Upload Dropzone */}
        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-2xl p-6 text-center hover:border-primary/50 transition-colors bg-[#F4F8F5]">
            <Upload className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-xs font-bold text-[#0B3323]">Select CSV file from your device</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
              Must include headers: <code className="bg-white px-1.5 py-0.5 rounded border border-border">username, real_name, contact_info, seed_number</code>
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-file-upload-input"
            />
            <label htmlFor="csv-file-upload-input">
              <Button asChild size="sm" variant="outline" className="rounded-xl font-bold text-xs cursor-pointer">
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
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border text-xs">
              <div className="flex items-center gap-3">
                <span className="font-bold text-[#0B3323]">
                  Valid: <span className="text-emerald-600">{csvResult.validCount}</span>
                </span>
                <span className="font-bold text-[#0B3323]">
                  Invalid: <span className="text-destructive">{csvResult.invalidCount}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={csvResult.exceedsCapacity ? 'destructive' : 'efootball'} className="text-[11px]">
                  Capacity: {existingParticipants.length + csvResult.validCount} / {maxParticipants}
                </Badge>
              </div>
            </div>

            {/* Capacity Warning Alert */}
            {csvResult.exceedsCapacity && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-semibold flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  This CSV file exceeds the tournament capacity limit of {maxParticipants} participants (Current: {existingParticipants.length}, Available: {csvResult.availableCapacity}). Please remove excess rows from the file before importing.
                </span>
              </div>
            )}

            {/* Preview Data Table */}
            <div className="flex-1 overflow-y-auto no-scrollbar rounded-xl border border-border bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F4F8F5] text-[#0B3323] font-bold border-b border-border sticky top-0">
                  <tr>
                    <th className="p-3 w-12 text-center">Row</th>
                    <th className="p-3">Username</th>
                    <th className="p-3">Real Name</th>
                    <th className="p-3">Contact</th>
                    <th className="p-3 w-16">Seed</th>
                    <th className="p-3">Status / Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {csvResult.rows.map((row) => (
                    <tr key={row.rowIndex} className={row.isValid ? 'hover:bg-secondary/20' : 'bg-destructive/5'}>
                      <td className="p-3 text-center font-mono text-muted-foreground">{row.rowIndex}</td>
                      <td className="p-3 font-semibold text-[#0B3323]">{row.rawUsername || '-'}</td>
                      <td className="p-3 text-muted-foreground">{row.rawRealName || '-'}</td>
                      <td className="p-3 text-muted-foreground">{row.rawContactInfo || '-'}</td>
                      <td className="p-3 font-mono font-[#0B3323] font-bold text-primary">{row.rawSeedNumber || '-'}</td>
                      <td className="p-3">
                        {row.isValid ? (
                          <Badge variant="secondary" className="gap-1 text-[11px] bg-emerald-100 text-emerald-800 border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
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
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/60">
          <Button variant="outline" onClick={resetStateAndClose} disabled={isImporting} className="rounded-xl text-xs">
            Cancel
          </Button>

          <Button
            onClick={handleImportExecute}
            disabled={!csvResult || csvResult.validCount === 0 || csvResult.exceedsCapacity || isImporting}
            className="rounded-xl font-bold text-xs gap-2"
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                <span>Import {csvResult ? csvResult.validCount : 0} Valid Participants</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
