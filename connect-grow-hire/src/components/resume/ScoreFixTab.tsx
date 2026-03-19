/**
 * Score & Fix tab: score resume, fix resume, replace with fixed version.
 * Uses backend-stored user resume. On replace, calls onResumeReplaced() so parent can loadResume() and switch to Editor.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, X, BarChart3, Wrench } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { fixResume, scoreResume, replaceMainResume, type ScoreCategory } from '@/services/resumeWorkshop';

export interface ScoreFixTabProps {
  uid: string;
  hasStoredResume: boolean;
  credits?: number;
  updateCredits?: (n: number) => Promise<void>;
  onResumeReplaced: () => void;
}

export function ScoreFixTab(props: ScoreFixTabProps) {
  const { uid, hasStoredResume, credits = 0, updateCredits, onResumeReplaced } = props;
  const [isScoring, setIsScoring] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [scoreData, setScoreData] = useState<{
    score: number;
    score_label: string;
    categories: ScoreCategory[];
    summary: string;
    cached?: boolean;
  } | null>(null);
  const [fixedPdfBase64, setFixedPdfBase64] = useState<string | null>(null);
  const [fixedResumeText, setFixedResumeText] = useState<string | null>(null);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getScoreColor = (score: number) => (score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600');
  const getScoreBadgeStyles = (score: number) => (score >= 80 ? 'bg-green-100 text-green-700' : score >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700');

  const handleScore = async () => {
    if (!hasStoredResume) {
      toast({ title: 'No resume', description: 'Save your resume from the Editor tab first.', variant: 'destructive' });
      return;
    }
    if (credits < 5) {
      toast({ title: 'Insufficient credits', description: 'You need at least 5 credits.', variant: 'destructive' });
      return;
    }
    setError(null);
    setIsScoring(true);
    try {
      const result = await scoreResume();
      if (result.status === 'ok' && result.score !== undefined) {
        setScoreData({
          score: result.score,
          score_label: result.score_label || '',
          categories: result.categories || [],
          summary: result.summary || '',
          cached: result.cached,
        });
        toast({ title: result.cached ? 'Score retrieved' : 'Score complete', description: result.cached ? 'From recent score (no credits charged).' : `${result.score}/100` });
      } else if (result.status === 'error') {
        const msg = result.message || 'Failed to score resume';
        setError(msg);
        toast({ title: 'Error', description: msg, variant: 'destructive' });
      }
      if (result.credits_remaining !== undefined && updateCredits) await updateCredits(result.credits_remaining);
    } catch (err: any) {
      setError(err?.message || 'Network error');
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    } finally {
      setIsScoring(false);
    }
  };

  const handleFix = async () => {
    if (!hasStoredResume) {
      toast({ title: 'No resume', description: 'Save your resume from the Editor tab first.', variant: 'destructive' });
      return;
    }
    if (credits < 5) {
      toast({ title: 'Insufficient credits', description: 'You need at least 5 credits.', variant: 'destructive' });
      return;
    }
    setError(null);
    setFixedPdfBase64(null);
    setFixedResumeText(null);
    setIsFixing(true);
    try {
      const result = await fixResume();
      if (result.status === 'error') {
        setError(result.message || 'Fix failed.');
        toast({ title: 'Error', description: result.message, variant: 'destructive' });
        return;
      }
      setFixedPdfBase64(result.pdf_base64 || null);
      setFixedResumeText(result.improved_resume_text || null);
      if (result.credits_remaining !== undefined && updateCredits) await updateCredits(result.credits_remaining);
      toast({ title: 'Resume fixed', description: 'Review and replace your resume below.' });
    } catch (err: any) {
      setError(err?.message || 'An error occurred.');
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    } finally {
      setIsFixing(false);
    }
  };

  const handleReplaceConfirm = async () => {
    if (!fixedPdfBase64 || !fixedResumeText) return;
    setIsReplacing(true);
    try {
      const result = await replaceMainResume({ pdf_base64: fixedPdfBase64, resume_text: fixedResumeText });
      if (result.status === 'error') {
        toast({ title: 'Error', description: result.message, variant: 'destructive' });
        return;
      }
      setShowReplaceModal(false);
      setFixedPdfBase64(null);
      setFixedResumeText(null);
      toast({ title: 'Resume replaced', description: 'Your main resume has been updated.' });
      onResumeReplaced();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    } finally {
      setIsReplacing(false);
    }
  };

  if (!uid) return null;

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-[3px] bg-red-50 border border-red-200 text-red-700 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-600 hover:text-red-800">×</button>
        </div>
      )}
      {!hasStoredResume && (
        <div className="p-4 rounded-[3px] bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <p className="font-medium">Save your resume first</p>
          <p className="mt-1">Use the Editor tab to add content and click &quot;Save Changes&quot;. Score and Fix use your saved resume.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleScore} disabled={!hasStoredResume || isScoring || credits < 5} variant="outline" size="sm" className="gap-2">
          {isScoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
          Score Resume
        </Button>
        <Button onClick={handleFix} disabled={!hasStoredResume || isFixing || credits < 5} variant="outline" size="sm" className="gap-2">
          {isFixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
          Fix Resume
        </Button>
      </div>
      {credits < 5 && <p className="text-xs text-amber-600">You need at least 5 credits for Score or Fix.</p>}
      {scoreData && (
        <div className={`rounded-[3px] border p-4 ${scoreData.score >= 80 ? 'bg-green-50 border-green-200' : scoreData.score >= 60 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${getScoreColor(scoreData.score)}`}>{scoreData.score}</span>
            <span className="text-gray-500">/ 100</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-2 ${getScoreBadgeStyles(scoreData.score)}`}>
              {scoreData.score_label || (scoreData.score >= 80 ? 'Excellent' : scoreData.score >= 60 ? 'Good' : 'Needs Work')}
            </span>
          </div>
          {scoreData.summary && <p className="text-sm text-gray-600 mt-2">{scoreData.summary}</p>}
          {scoreData.categories?.length > 0 && (
            <div className="mt-3 space-y-1">
              {scoreData.categories.map((cat, i) => (
                <div key={i} className="text-xs text-gray-600"><span className="font-medium">{cat.name}:</span> {cat.explanation}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {fixedPdfBase64 && fixedResumeText && (
        <div className="border border-gray-200 rounded-[3px] overflow-hidden bg-white">
          <div className="px-4 py-2 border-b bg-gray-50"><span className="text-sm font-medium text-gray-700">Improved resume</span></div>
          <div className="p-4">
            <iframe src={`data:application/pdf;base64,${fixedPdfBase64}`} className="w-full h-[400px] rounded border" title="Fixed resume preview" />
            <Button onClick={() => setShowReplaceModal(true)} className="mt-4 bg-[#0F172A] hover:bg-[#1E293B]">Replace my resume with this version</Button>
          </div>
        </div>
      )}
      {showReplaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !isReplacing && setShowReplaceModal(false)} />
          <div className="relative bg-white rounded-[3px] shadow-xl max-w-md w-full mx-4 p-6">
            <button onClick={() => !isReplacing && setShowReplaceModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            <div className="w-14 h-14 bg-gray-100 rounded-[3px] flex items-center justify-center mx-auto mb-4"><FileText className="w-7 h-7 text-gray-600" /></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-3 text-center">Replace resume in account settings?</h2>
            <p className="text-gray-600 mb-6 text-center">This will replace your current resume across Offerloop.</p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => !isReplacing && setShowReplaceModal(false)} disabled={isReplacing} className="rounded-full px-6">Cancel</Button>
              <Button onClick={handleReplaceConfirm} disabled={isReplacing} className="bg-[#0F172A] hover:bg-[#1E293B] rounded-full px-6">
                {isReplacing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Replace Resume
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
