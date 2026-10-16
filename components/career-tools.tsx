"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownToLine, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, CircleHelp, ClipboardList, FileText, FileUp, FolderOpen, Headphones, LoaderCircle, Mail, MessageSquare, Pencil, Plus, Save, Send, Settings2, ShieldCheck, Sparkles, Target, Trash2, UserRound, WandSparkles, X } from "lucide-react";
import { statuses, type Application, type ApplicationStatus, type Document as CareerDocument, type FeatureProps, type Interview, type Profile, type SupportMessage } from "@/lib/types";
import "./career-tools.css";

const uid = () => crypto.randomUUID();
const prettyDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
function downloadText(text: string, filename: string, type = "text/plain;charset=utf-8") {
  const href = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = href; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
function safeFilename(title: string) { return title.replace(/[^a-z0-9-_ ]/gi, "").trim().slice(0, 90) || "careerpilot-document"; }
function printDocument(title: string, content: string) {
  const popup = window.open("", "_blank", "width=820,height=920");
  if (!popup) throw new Error("Allow pop-ups to open the print preview, then choose Save as PDF.");
  popup.document.title = title;
  const style = popup.document.createElement("style");
  style.textContent = "body{font:12pt/1.6 Georgia,serif;padding:36px;max-width:760px;margin:auto;color:#172822}h1{font:24pt/1.25 Arial,sans-serif}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{padding:0}@page{margin:20mm}}";
  const heading = popup.document.createElement("h1"); heading.textContent = title;
  const body = popup.document.createElement("pre"); body.textContent = content;
  popup.document.head.appendChild(style); popup.document.body.appendChild(heading); popup.document.body.appendChild(body);
  setTimeout(() => { popup.focus(); popup.print(); }, 200);
}
async function apiAI(body: Record<string, string>) {
  const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as {error?:string;text?:string;id:string;name?:string};
  if (!response.ok) throw new Error(result.error || "The request could not be completed. Please try again.");
  if (!result.text?.trim()) throw new Error("No content was returned. Please try again.");
  return result.text as string;
}
function ErrorNote({ text }: { text: string }) { return text ? <div className="ct-error" role="alert">{text}</div> : null; }
function BusyIcon({ busy, children }: { busy: boolean; children: ReactNode }) { return busy ? <LoaderCircle size={16} className="ct-spin" /> : children; }
function PageTitle({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <div className="ct-page-title"><div><div className="ct-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
function AIStatus({ available }: { available: boolean }) { return <span className={`ct-status ${available ? "ct-status-green" : "ct-status-amber"}`}><span />{available ? "AI connected" : "AI setup needed"}</span>; }
function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) { return <div className="ct-empty"><div className="ct-empty-icon">{icon}</div><h3>{title}</h3><p>{body}</p>{action}</div>; }

export function ResumeStudio({ state, update, notify, capabilities, selectedJobId, navigate }: FeatureProps) {
  const [tab, setTab] = useState<"studio" | "master" | "library">("studio");
  const [resume, setResume] = useState(state.profile.resume);
  const [resumeSource, setResumeSource] = useState(state.profile.resume);
  const [jobId, setJobId] = useState(selectedJobId || state.jobs[0]?.id || "");
  const [manualRole, setManualRole] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState("");
  const [editor, setEditor] = useState("");
  const [editorTitle, setEditorTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [unsavedDraft, setUnsavedDraft] = useState<CareerDocument | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  if (resumeSource !== state.profile.resume) {
    if (resume === resumeSource) setResume(state.profile.resume);
    setResumeSource(state.profile.resume);
  }
  const active = state.documents.find(doc => doc.id === activeId);
  const job = state.jobs.find(item => item.id === jobId);
  const jobDescription = job?.description || description;
  const openDoc = (doc: CareerDocument) => { setActiveId(doc.id); setEditor(doc.content); setEditorTitle(doc.title); setConfirmDelete(false); setTab("library"); setError(""); };
  async function saveResume() {
    setBusy("save"); setError("");
    try { if (await update({ ...state, profile: { ...state.profile, resume } })) notify("Master resume saved."); }
    finally { setBusy(""); }
  }
  async function generate(task: string, label: string, type: CareerDocument["type"]) {
    setError("");
    if (!resume.trim()) { setError("Add your master resume first so your documents reflect your actual experience."); setTab("master"); return; }
    if (!jobDescription.trim()) { setError("Select a job with a description, or paste the role details below."); return; }
    if (state.documents.length >= 100) { setError("Your library has reached 100 documents. Remove an old document before creating another."); return; }
    setBusy(task);
    try {
      const text = await apiAI({ task, resume, jobDescription, role: job?.title || manualRole, company: job?.company || manualCompany });
      const doc: CareerDocument = { id: uid(), title: `${label} · ${job?.company || manualCompany || "New role"}`.slice(0, 300), type, content: text, jobId: job?.id || "", createdAt: new Date().toISOString() };
      setUnsavedDraft(doc);
      if (await update({ ...state, profile: { ...state.profile, resume }, documents: [doc, ...state.documents] })) { setUnsavedDraft(null); openDoc(doc); notify(`${label} saved. Review the draft before using it.`); }
      else setError("Your draft is ready but was not saved. Download it below, or retry saving it to the current workspace.");
    } catch (err) { setError(err instanceof Error ? err.message : "Generation failed."); }
    finally { setBusy(""); }
  }
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (file.size > 5 * 1024 * 1024) { setError("Choose a PDF or TXT file smaller than 5 MB."); return; }
    if (!/\.(pdf|txt)$/i.test(file.name)) { setError("Only PDF and plain-text files are supported."); return; }
    if (/\.txt$/i.test(file.name)) {
      let content: string;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
      catch { setError("TXT resumes must contain UTF-8 text."); return; }
      if (!content.trim() || content.includes('\u0000') || content.length > 60000) { setError("Choose a plain-text resume with 1 to 60,000 characters."); return; }
      setResume(content); setTab("master");
      if (uploadRef.current) uploadRef.current.value = "";
      notify("Text loaded into your master resume. Review and save your changes."); return;
    }
    if (!capabilities.storage) { setError("File storage is not configured. Paste the text from your resume to get started."); return; }
    setBusy("upload");
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/files", { method: "POST", body: form });
      const result = await response.json() as {error?:string;text?:string;id:string;name?:string}; if (!response.ok) throw new Error(result.error || "Upload failed.");
      const doc: CareerDocument = { id: uid(), title: (result.name || file.name).slice(0, 300), type: "Resume", content: "", jobId: "", createdAt: new Date().toISOString(), fileId: result.id, fileName: result.name || file.name };
      setUnsavedDraft(doc);
      if (await update({ ...state, documents: [doc, ...state.documents] })) { setUnsavedDraft(null); openDoc(doc); notify("PDF uploaded. Extract the text to use it as your master resume."); }
      else setError("The PDF uploaded, but its library entry could not be saved. Retry saving the entry below.");
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed."); }
    finally { setBusy(""); if (uploadRef.current) uploadRef.current.value = ""; }
  }
  async function extractPDF() {
    if (!active?.fileId) return;
    setBusy("parse"); setError("");
    try {
      const text = await apiAI({ task: "parse-resume", fileId: active.fileId });
      const docs = state.documents.map(doc => doc.id === active.id ? { ...doc, content: text } : doc);
      const saved = await update({ ...state, documents: docs });
      setEditor(text); setResume(text); setTab("master");
      if (saved) notify("Resume text extracted. Check it for accuracy, then save your master resume.");
      else setError("Text was extracted but could not be saved to the document. Review the text below and save your master resume.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not extract PDF text."); }
    finally { setBusy(""); }
  }
  async function saveDoc() {
    if (!active || !editorTitle.trim()) return;
    setBusy("document");
    try { if (await update({ ...state, documents: state.documents.map(doc => doc.id === active.id ? { ...doc, title: editorTitle, content: editor } : doc) })) notify("Document updated."); }
    finally { setBusy(""); }
  }
  async function deleteDoc() {
    if (!active) return;
    setBusy("delete");
    try { if (await update({ ...state, documents: state.documents.filter(doc => doc.id !== active.id) })) { setActiveId(""); setConfirmDelete(false); notify("Document removed from your library."); } }
    finally { setBusy(""); }
  }
  async function retryDraft() {
    if (!unsavedDraft) return;
    setBusy("retry"); setError("");
    try {
      if (await update({ ...state, documents: [unsavedDraft, ...state.documents.filter(doc => doc.id !== unsavedDraft.id)] })) {
        openDoc(unsavedDraft); setUnsavedDraft(null); notify("Document saved to your library.");
      } else setError("This draft still could not be saved. Download a copy before leaving this page.");
    } finally { setBusy(""); }
  }
  const actions = [
    { task: "tailor", title: "Tailor my resume", description: "Bring relevant experience forward for this role.", icon: FileText, type: "Resume" as const },
    { task: "cover-letter", title: "Write a cover letter", description: "A thoughtful first draft, in your own story.", icon: Mail, type: "Cover letter" as const },
    { task: "ats", title: "Review job alignment", description: "Identify skills, keywords, and experience gaps.", icon: Target, type: "Review" as const },
    { task: "outreach", title: "Draft an introduction", description: "Start a conversation with a recruiter.", icon: MessageSquare, type: "Outreach" as const },
  ];
  return <section className="ct-root">
    <PageTitle eyebrow="YOUR CAREER TOOLKIT" title="Resume studio" description="Your experience, thoughtfully tailored to your next opportunity."><button className="ct-btn ct-btn-secondary" disabled={!!busy} onClick={() => uploadRef.current?.click()}><FileUp size={17} />Upload resume</button></PageTitle>
    <input ref={uploadRef} type="file" accept=".pdf,.txt" aria-label="Upload PDF or TXT resume" hidden onChange={event => void upload(event.target.files?.[0])} />
    <div className="ct-tabs" role="tablist" aria-label="Resume workspace">
      <button role="tab" disabled={!!busy} aria-selected={tab === "studio"} onClick={() => setTab("studio")}><WandSparkles size={16} />Create a document</button>
      <button role="tab" disabled={!!busy} aria-selected={tab === "master"} onClick={() => setTab("master")}><FileText size={16} />Master resume{state.profile.resume && <span className="ct-dot" />}</button>
      <button role="tab" disabled={!!busy} aria-selected={tab === "library"} onClick={() => setTab("library")}><FolderOpen size={16} />My documents <span className="ct-count">{state.documents.length}</span></button>
    </div>
    <ErrorNote text={error} />
    {unsavedDraft && <div className="ct-card ct-card-pad"><h3>Unsaved document · {unsavedDraft.title}</h3><p>This copy is available in this tab. Save it to your library or download it before leaving.</p><div className="ct-inline-actions"><button className="ct-btn ct-btn-primary" disabled={!!busy} onClick={() => void retryDraft()}>Retry saving</button>{unsavedDraft.content && <button className="ct-btn ct-btn-secondary" onClick={() => downloadText(unsavedDraft.content, `${safeFilename(unsavedDraft.title)}.txt`)}>Download draft</button>}{unsavedDraft.fileId && <a className="ct-btn ct-btn-secondary" href={`/api/files?id=${encodeURIComponent(unsavedDraft.fileId)}`}>Download original</a>}</div>{unsavedDraft.content && <details><summary>Read draft</summary><div className="ct-prose">{unsavedDraft.content}</div></details>}</div>}
    {tab === "studio" && <div className="ct-split">
      <div className="ct-stack">
        <div className="ct-card ct-card-pad"><div className="ct-card-heading"><div className="ct-step">1</div><div><h2>Choose your opportunity</h2><p>A specific job description makes a better starting point.</p></div></div>
          <label className="ct-field">Target role<select value={jobId} onChange={event => setJobId(event.target.value)}><option value="">Paste a job description</option>{state.jobs.map(item => <option key={item.id} value={item.id}>{item.title} · {item.company}</option>)}</select></label>
          {job ? <div className="ct-job-preview"><div className="ct-company-mark">{job.company.charAt(0)}</div><div><strong>{job.title}</strong><span>{job.company} · {job.location}</span><span className="ct-muted">{job.workplace}</span></div><button className="ct-icon-btn" title="Browse jobs" onClick={() => navigate("jobs")}><ChevronRight size={18} /></button></div> : <><div className="ct-form-grid"><label className="ct-field">Role title<input maxLength={300} value={manualRole} onChange={event => setManualRole(event.target.value)} placeholder="e.g. Product Designer" /></label><label className="ct-field">Company<input maxLength={300} value={manualCompany} onChange={event => setManualCompany(event.target.value)} placeholder="e.g. Acme" /></label></div><label className="ct-field">Job description<textarea rows={6} maxLength={40000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Paste the responsibilities, requirements, and other role details…" /></label></>}
          {job && !job.description && <label className="ct-field">Job description<textarea rows={5} maxLength={40000} value={description} onChange={event => setDescription(event.target.value)} placeholder="This job has no description. Add it here…" /></label>}
        </div>
        <div className="ct-card ct-card-pad"><div className="ct-card-heading"><div className="ct-step">2</div><div><h2>Make it yours</h2><p>Choose a document. Refine the draft before sending.</p></div><AIStatus available={capabilities.ai} /></div>
          {!capabilities.ai && <div className="ct-notice">AI generation becomes available when the server’s OpenAI connection is configured. You can save your resume and manage documents now.</div>}
          <div className="ct-action-grid">{actions.map(action => <button key={action.task} className="ct-action" disabled={!!busy || !capabilities.ai} onClick={() => void generate(action.task, action.title, action.type)}><span className="ct-action-icon"><BusyIcon busy={busy === action.task}><action.icon size={19} /></BusyIcon></span><strong>{busy === action.task ? "Creating your draft…" : action.title}</strong><span>{action.description}</span><ArrowRight size={16} className="ct-action-arrow" /></button>)}</div>
        </div>
      </div>
      <aside className="ct-stack"><div className="ct-card ct-card-pad ct-sage-card"><div className="ct-large-icon"><FileText size={25} /></div><h2>It starts with your story.</h2><p>Your master resume is the source for every tailored document. Keep it factual, detailed, and up to date.</p><div className="ct-divider" /><div className="ct-row"><span>Master resume</span><span className={`ct-small-badge ${resume.trim() ? "ct-badge-green" : "ct-badge-amber"}`}>{resume.trim() ? "Added" : "Not added"}</span></div><p className="ct-small">{resume.trim() ? `${resume.trim().split(/\s+/).length.toLocaleString()} words ready to work with` : "Add your experience, education, and skills."}</p><button className="ct-btn ct-btn-secondary ct-full" onClick={() => setTab("master")}>{resume.trim() ? "Edit master resume" : "Add master resume"}<ArrowRight size={16} /></button></div>
      <div className="ct-card ct-card-pad"><div className="ct-row"><h3>Recently created</h3><FolderOpen size={17} className="ct-muted" /></div>{state.documents.length ? state.documents.slice(0, 3).map(doc => <button className="ct-doc-row" key={doc.id} disabled={!!busy} onClick={() => openDoc(doc)}><FileText size={18} /><span><strong>{doc.title}</strong><small>{doc.type} · {prettyDate(doc.createdAt)}</small></span><ChevronRight size={15} /></button>) : <p className="ct-small ct-muted">Your saved drafts will appear here.</p>}</div>
      <div className="ct-subtle-note"><ShieldCheck size={19} /><p>AI drafts need your review. Alignment analysis is guidance, not a guaranteed ATS score or interview outcome.</p></div></aside>
    </div>}
    {tab === "master" && <div className="ct-split"><div className="ct-card ct-card-pad"><div className="ct-card-heading"><div><h2>Your master resume</h2><p>The complete picture of your skills and experience.</p></div><span className="ct-small-badge">{resume.trim() ? resume.trim().split(/\s+/).length : 0} words</span></div><label className="ct-field">Resume content<textarea className="ct-resume-text" disabled={!!busy} rows={22} value={resume} maxLength={60000} onChange={event => setResume(event.target.value)} placeholder="YOUR NAME\nContact details · Location\n\nPROFESSIONAL SUMMARY\nA few lines about your experience and strengths…\n\nEXPERIENCE\nRole · Company · Dates\n• Your responsibilities and measurable achievements\n\nEDUCATION\nDegree · Institution\n\nSKILLS\nYour relevant skills and tools" /></label><div className="ct-form-footer"><span className="ct-small ct-muted">{resume === state.profile.resume ? "All changes saved" : "You have unsaved changes"}</span><button className="ct-btn ct-btn-primary" disabled={!!busy || resume === state.profile.resume} onClick={() => void saveResume()}><BusyIcon busy={busy === "save"}><Save size={16} /></BusyIcon>Save master resume</button></div></div><aside className="ct-card ct-card-pad ct-fit"><h3>A strong foundation</h3><ul className="ct-tips"><li><CheckCircle2 size={17} />Include dates, job titles, and company names.</li><li><CheckCircle2 size={17} />Add specific outcomes and measurable impact.</li><li><CheckCircle2 size={17} />Keep your actual skills and qualifications accurate.</li><li><CheckCircle2 size={17} />Check text extracted from PDFs before saving.</li></ul><button className="ct-btn ct-btn-secondary ct-full" onClick={() => uploadRef.current?.click()} disabled={!!busy}><FileUp size={16} />Import PDF or TXT</button><p className="ct-small ct-muted">Up to 5 MB. PDF extraction uses AI when available.</p></aside></div>}
    {tab === "library" && <div className="ct-library"><aside className="ct-card ct-library-list"><div className="ct-card-pad"><h2>Your documents</h2><p>{state.documents.length} saved {state.documents.length === 1 ? "document" : "documents"}</p></div>{state.documents.length ? state.documents.map(doc => <button key={doc.id} className={`ct-library-item ${activeId === doc.id ? "ct-library-active" : ""}`} disabled={!!busy} onClick={() => openDoc(doc)}><span className="ct-file-icon"><FileText size={19} /></span><span><strong>{doc.title}</strong><small>{doc.type} · {prettyDate(doc.createdAt)}</small></span></button>) : <Empty icon={<FolderOpen size={24} />} title="Your next draft starts here" body="Create a tailored document or upload an existing resume." action={<button className="ct-btn ct-btn-secondary" onClick={() => setTab("studio")}>Create a document</button>} />}</aside><div className="ct-card ct-card-pad">{active ? <><div className="ct-row"><span className="ct-small-badge">{active.type}</span><div className="ct-inline-actions">{active.fileId && <a className="ct-btn ct-btn-secondary ct-btn-small" href={`/api/files?id=${encodeURIComponent(active.fileId)}`}><ArrowDownToLine size={15} />Original PDF</a>}<button className="ct-icon-btn ct-danger" title="Delete document" disabled={!!busy} onClick={() => setConfirmDelete(true)}><Trash2 size={17} /></button></div></div>{confirmDelete && <div className="ct-delete-confirm"><span>Remove this document from your library?</span><button className="ct-btn ct-btn-danger ct-btn-small" disabled={!!busy} onClick={() => void deleteDoc()}>Remove</button><button className="ct-icon-btn" title="Cancel deletion" onClick={() => setConfirmDelete(false)}><X size={16} /></button></div>}<label className="ct-field">Document title<input disabled={!!busy} value={editorTitle} onChange={event => setEditorTitle(event.target.value)} maxLength={200} /></label>{active.fileId && !editor && <div className="ct-notice">This is an uploaded PDF. <button className="ct-link" disabled={!!busy || !capabilities.ai} onClick={() => void extractPDF()}>{busy === "parse" ? "Extracting text…" : "Extract text with AI"}</button>{!capabilities.ai && " — AI connection required."}</div>}<label className="ct-field">Document content<textarea rows={21} disabled={!!busy} value={editor} onChange={event => setEditor(event.target.value)} maxLength={60000} placeholder="Write or paste your document content…" /></label><div className="ct-form-footer ct-wrap"><div className="ct-inline-actions"><button className="ct-btn ct-btn-secondary ct-btn-small" disabled={!editor.trim()} onClick={() => downloadText(editor, `${safeFilename(editorTitle)}.txt`)}><ArrowDownToLine size={15} />TXT</button><button className="ct-btn ct-btn-secondary ct-btn-small" disabled={!editor.trim()} onClick={() => { try { printDocument(editorTitle, editor); } catch (err) { setError((err as Error).message); } }}><FileText size={15} />Print / PDF</button></div><button className="ct-btn ct-btn-primary" disabled={!!busy || !editorTitle.trim() || (editor === active.content && editorTitle === active.title)} onClick={() => void saveDoc()}><BusyIcon busy={busy === "document"}><Save size={16} /></BusyIcon>Save changes</button></div></> : <Empty icon={<FileText size={30} />} title="A little preparation goes a long way" body="Select a document to review, edit, and download it." action={<button className="ct-btn ct-btn-primary" onClick={() => setTab("studio")}><Plus size={16} />Create a document</button>} />}</div></div>}
  </section>;
}

const emptyInterview = (): Interview => ({ id: "", company: "", role: "", date: "", type: "Video call", notes: "", questions: "", feedback: "" });
function calendarEvent(item: Interview) {
  const date = new Date(item.date); const end = new Date(date.getTime() + 60 * 60 * 1000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, "\\$&");
  const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CareerPilot//Interviews//EN", "BEGIN:VEVENT", `UID:${item.id}@careerpilot`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(date)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(`${item.role} interview · ${item.company}`)}`, `DESCRIPTION:${esc(`${item.type}\n${item.notes}`)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  downloadText(content, `${safeFilename(item.company)}-interview.ics`, "text/calendar;charset=utf-8");
}
export function InterviewPrep({ state, update, notify, capabilities }: FeatureProps) {
  const [form, setForm] = useState<Interview | null>(null);
  const [selectedId, setSelectedId] = useState(state.interviews[0]?.id || "");
  const [role, setRole] = useState(state.interviews[0]?.role || state.profile.roles.slice(0, 300) || "");
  const [company, setCompany] = useState(state.interviews[0]?.company || "");
  const [questions, setQuestions] = useState(state.interviews[0]?.questions || "");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(state.interviews[0]?.feedback || "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const selected = state.interviews.find(item => item.id === selectedId);
  const sorted = [...state.interviews].sort((a, b) => a.date.localeCompare(b.date));
  function chooseInterview(id: string) {
    setSelectedId(id); const item = state.interviews.find(interview => interview.id === id);
    setQuestions(item?.questions || ""); setFeedback(item?.feedback || ""); setQuestion(""); setAnswer("");
    if (item) { setRole(item.role); setCompany(item.company); }
  }
  async function saveInterview(event: FormEvent) {
    event.preventDefault(); if (!form) return; setBusy("save");
    try {
      const item = { ...form, id: form.id || uid() };
      const interviews = state.interviews.some(old => old.id === item.id) ? state.interviews.map(old => old.id === item.id ? item : old) : [...state.interviews, item];
      if (await update({ ...state, interviews })) { setForm(null); setSelectedId(item.id); setRole(item.role); setCompany(item.company); setQuestions(item.questions); setFeedback(item.feedback); notify("Interview saved."); }
    } finally { setBusy(""); }
  }
  async function generateQuestions() {
    if (!role.trim()) { setError("Add a role title to create relevant practice questions."); return; }
    setError(""); setBusy("questions");
    try {
      const text = await apiAI({ task: "interview", role, company, resume: state.profile.resume, jobDescription: selected?.notes || "" });
      const saved = selected ? await update({ ...state, interviews: state.interviews.map(item => item.id === selected.id ? { ...item, questions: text } : item) }) : false;
      setQuestions(text);
      if (selected && !saved) setError("Questions were generated but could not be saved to the interview. Download them below before leaving this page.");
      else notify(selected ? "Practice questions added to this interview." : "Practice questions ready. Download them to keep a copy.");
    } catch (err) { setError((err as Error).message); } finally { setBusy(""); }
  }
  async function reviewAnswer() {
    setError(""); setBusy("feedback");
    try {
      const text = await apiAI({ task: "feedback", role, company, resume: state.profile.resume, question, answer });
      const saved = selected ? await update({ ...state, interviews: state.interviews.map(item => item.id === selected.id ? { ...item, feedback: text } : item) }) : false;
      setFeedback(text);
      if (selected && !saved) setError("Feedback was generated but could not be saved to the interview. Download it below before leaving this page.");
    } catch (err) { setError((err as Error).message); } finally { setBusy(""); }
  }
  async function removeInterview() {
    setBusy("delete");
    try { if (await update({ ...state, interviews: state.interviews.filter(item => item.id !== deleteId) })) { if (selectedId === deleteId) chooseInterview(""); setDeleteId(""); notify("Interview removed."); } }
    finally { setBusy(""); }
  }
  return <section className="ct-root"><PageTitle eyebrow="SHOW UP PREPARED" title="Interview prep" description="Turn your experience into clear, confident conversations."><button className="ct-btn ct-btn-primary" onClick={() => setForm(emptyInterview())}><Plus size={17} />Add interview</button></PageTitle><ErrorNote text={error} />
    {form && <form className="ct-card ct-card-pad ct-form-panel" onSubmit={saveInterview}><div className="ct-row"><h2>{form.id ? "Edit interview" : "Schedule an interview"}</h2><button className="ct-icon-btn" type="button" aria-label="Close interview form" onClick={() => setForm(null)}><X size={18} /></button></div><div className="ct-form-grid"><label className="ct-field">Company<input required value={form.company} onChange={event => setForm({ ...form, company: event.target.value })} placeholder="Company name" /></label><label className="ct-field">Role<input required value={form.role} onChange={event => setForm({ ...form, role: event.target.value })} placeholder="Role title" /></label><label className="ct-field">Date and time · your local time<input type="datetime-local" required value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label><label className="ct-field">Interview format<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}>{["Video call", "Phone screen", "In person", "Technical round", "Panel", "Other"].map(type => <option key={type}>{type}</option>)}</select></label></div><label className="ct-field">Notes<textarea rows={3} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Meeting link, interviewer names, or things to prepare…" /></label><div className="ct-form-footer"><span className="ct-small ct-muted">Download a calendar event after saving.</span><button className="ct-btn ct-btn-primary" disabled={!!busy}><BusyIcon busy={busy === "save"}><Check size={17} /></BusyIcon>Save interview</button></div></form>}
    <div className="ct-split"><div className="ct-stack"><div className="ct-card ct-card-pad"><div className="ct-card-heading"><span className="ct-large-icon"><Sparkles size={22} /></span><div><h2>Your practice room</h2><p>Relevant questions. Thoughtful answers. More confidence.</p></div><AIStatus available={capabilities.ai} /></div>{!capabilities.ai && <div className="ct-notice">AI practice needs a configured OpenAI connection. You can still organize interviews and write your practice answers.</div>}<label className="ct-field">Prepare for<select value={selectedId} disabled={!!busy} onChange={event => chooseInterview(event.target.value)}><option value="">General practice</option>{sorted.map(item => <option key={item.id} value={item.id}>{item.role} · {item.company}</option>)}</select></label><div className="ct-form-grid"><label className="ct-field">Target role<input maxLength={300} disabled={!!busy} value={role} onChange={event => setRole(event.target.value)} placeholder="e.g. Senior Product Designer" /></label><label className="ct-field">Company <span className="ct-optional">optional</span><input maxLength={300} disabled={!!busy} value={company} onChange={event => setCompany(event.target.value)} placeholder="Company name" /></label></div><button className="ct-btn ct-btn-primary" disabled={!!busy || !capabilities.ai || !role.trim()} onClick={() => void generateQuestions()}><BusyIcon busy={busy === "questions"}><WandSparkles size={16} /></BusyIcon>{busy === "questions" ? "Preparing questions…" : "Generate practice questions"}</button>{questions && <div className="ct-generated"><div className="ct-row"><h3>Practice questions</h3><button className="ct-icon-btn" title="Download practice questions" onClick={() => downloadText(questions, "interview-practice.txt")}><ArrowDownToLine size={17} /></button></div><div className="ct-prose">{questions}</div></div>}</div>
    <div className="ct-card ct-card-pad"><div className="ct-card-heading"><div><h2>Make your answer stronger</h2><p>Practice a real example. Get specific suggestions.</p></div><MessageSquare size={20} className="ct-muted" /></div><label className="ct-field">Interview question<textarea rows={2} maxLength={5000} disabled={!!busy} value={question} onChange={event => setQuestion(event.target.value)} placeholder="e.g. Tell me about a time you influenced a difficult decision." /></label><label className="ct-field">Your answer<textarea rows={7} maxLength={15000} disabled={!!busy} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Set the scene, explain your role, describe your actions, and share the result…" /></label><div className="ct-form-footer"><span className="ct-small ct-muted">Try the STAR method: situation, task, action, result.</span><button className="ct-btn ct-btn-primary" disabled={!!busy || !capabilities.ai || !question.trim() || !answer.trim()} onClick={() => void reviewAnswer()}><BusyIcon busy={busy === "feedback"}><Sparkles size={16} /></BusyIcon>Get feedback</button></div>{feedback && <div className="ct-generated"><div className="ct-row"><h3>Feedback for your next attempt</h3><button className="ct-icon-btn" title="Download answer and feedback" onClick={() => downloadText(`${question}\n\n${answer}\n\nFEEDBACK\n${feedback}`, "interview-feedback.txt")}><ArrowDownToLine size={17} /></button></div><div className="ct-prose">{feedback}</div></div>}</div></div>
    <aside className="ct-stack"><div className="ct-card ct-card-pad"><div className="ct-row"><h3>Interview calendar</h3><span className="ct-count">{state.interviews.length}</span></div>{sorted.length ? sorted.map(item => <div className="ct-interview-item" key={item.id}><div className="ct-row"><span className="ct-small-badge">{item.type}</span><div className="ct-inline-actions"><button className="ct-icon-btn" title={`Edit ${item.company} interview`} disabled={!!busy} onClick={() => setForm(item)}><Pencil size={14} /></button><button className="ct-icon-btn ct-danger" title={`Delete ${item.company} interview`} disabled={!!busy} onClick={() => setDeleteId(item.id)}><Trash2 size={14} /></button></div></div><strong>{item.company}</strong><p>{item.role}</p><span className="ct-interview-date"><CalendarDays size={14} />{new Date(item.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>{item.notes && <p className="ct-small ct-clamp">{item.notes}</p>}{deleteId === item.id ? <div className="ct-delete-confirm"><span>Remove?</span><button className="ct-btn ct-btn-danger ct-btn-small" disabled={!!busy} onClick={() => void removeInterview()}>Remove</button><button className="ct-icon-btn" title="Cancel deletion" onClick={() => setDeleteId("")}><X size={15} /></button></div> : <div className="ct-inline-actions ct-mt"><button className="ct-btn ct-btn-secondary ct-btn-small" disabled={!!busy} onClick={() => chooseInterview(item.id)}>Practice<ArrowRight size={13} /></button><button className="ct-icon-btn" title="Download calendar event" onClick={() => calendarEvent(item)}><ArrowDownToLine size={16} /></button></div>}</div>) : <Empty icon={<CalendarDays size={24} />} title="Something to look forward to" body="Add an interview to keep your preparation and schedule together." action={<button className="ct-link" onClick={() => setForm(emptyInterview())}>Add your first interview <ArrowRight size={14} /></button>} />}</div><div className="ct-card ct-card-pad ct-sage-card"><h3>Your pre-interview checklist</h3><ul className="ct-tips"><li><CheckCircle2 size={17} />Read the role and learn about the company.</li><li><CheckCircle2 size={17} />Prepare three stories that show your impact.</li><li><CheckCircle2 size={17} />Bring thoughtful questions of your own.</li><li><CheckCircle2 size={17} />Test your setup and meeting link.</li></ul></div></aside></div>
  </section>;
}

export function ProfileSettings({ state, update, notify, capabilities }: FeatureProps) {
  const [profile, setProfile] = useState(state.profile);
  const [preferences, setPreferences] = useState(state.preferences);
  const [busy, setBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [review, setReview] = useState("");
  const [error, setError] = useState("");
  const completed = [profile.name, profile.headline, profile.location, profile.roles, profile.skills, profile.resume].filter(value => value.trim()).length;
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { if (await update({ ...state, profile: { ...profile, onboardingComplete: true }, preferences })) { setProfile({ ...profile, onboardingComplete: true }); notify("Profile and preferences saved."); } }
    finally { setBusy(false); }
  }
  async function reviewProfile() {
    setReviewBusy(true); setError("");
    try {
      const text = await apiAI({ task: "profile-review", resume: profile.resume, role: profile.roles.slice(0, 300), jobDescription: `Headline: ${profile.headline}\nTarget roles: ${profile.roles}\nSkills: ${profile.skills}\nExperience: ${profile.experience}\nLocation: ${profile.location}\nPreferences: ${profile.workplace}` });
      setReview(text);
      const doc: CareerDocument = { id: uid(), title: "Profile evaluation", type: "Review", content: text, jobId: "", createdAt: new Date().toISOString() };
      if (await update({ ...state, documents: [doc, ...state.documents] })) notify("Profile review saved to your document library.");
      else setError("Your review is ready but was not saved. Download it from the review panel before leaving this page.");
    } catch (err) { setError((err as Error).message); } finally { setReviewBusy(false); }
  }
  return <section className="ct-root"><PageTitle eyebrow="BUILT AROUND YOU" title="Profile & preferences" description="Help your next opportunity find the right version of you." /><ErrorNote text={error} /><div className="ct-split"><form className="ct-stack" onSubmit={save}><div className="ct-card ct-card-pad"><div className="ct-card-heading"><span className="ct-large-icon"><UserRound size={22} /></span><div><h2>The basics</h2><p>Your professional introduction.</p></div></div><div className="ct-form-grid"><label className="ct-field">Full name<input required value={profile.name} onChange={event => setProfile({ ...profile, name: event.target.value })} autoComplete="name" /></label><label className="ct-field">Contact email<input required type="email" value={profile.email} onChange={event => setProfile({ ...profile, email: event.target.value })} autoComplete="email" /></label><label className="ct-field ct-span-2">Professional headline<input value={profile.headline} onChange={event => setProfile({ ...profile, headline: event.target.value })} placeholder="e.g. Product designer crafting thoughtful digital experiences" /></label><label className="ct-field">Location<input value={profile.location} onChange={event => setProfile({ ...profile, location: event.target.value })} placeholder="City, state, or country" /></label><label className="ct-field">LinkedIn profile<input type="url" value={profile.linkedin} onChange={event => setProfile({ ...profile, linkedin: event.target.value })} placeholder="https://linkedin.com/in/yourname" /></label></div></div><div className="ct-card ct-card-pad"><div className="ct-card-heading"><span className="ct-large-icon"><Target size={22} /></span><div><h2>Your next chapter</h2><p>The roles and conditions that work for you.</p></div></div><div className="ct-form-grid"><label className="ct-field ct-span-2">Desired roles<input value={profile.roles} onChange={event => setProfile({ ...profile, roles: event.target.value })} placeholder="Product Designer, UX Designer, Design Lead" /></label><label className="ct-field">Experience level<select value={profile.experience} onChange={event => setProfile({ ...profile, experience: event.target.value })}><option value="">Select experience level</option>{["Student / Intern", "Entry level", "Mid-level", "Senior", "Lead / Manager", "Director / Executive"].map(level => <option key={level}>{level}</option>)}</select></label><label className="ct-field">Workplace preference<select value={profile.workplace} onChange={event => setProfile({ ...profile, workplace: event.target.value })}>{["Remote", "Hybrid", "On-site", "Open to any"].map(option => <option key={option}>{option}</option>)}</select></label><label className="ct-field">Desired compensation<input value={profile.salary} onChange={event => setProfile({ ...profile, salary: event.target.value })} placeholder="e.g. USD 120,000–150,000 / year" /></label><label className="ct-field">Work authorization<input value={profile.workAuthorization} onChange={event => setProfile({ ...profile, workAuthorization: event.target.value })} placeholder="e.g. US authorized; sponsorship required" /></label><label className="ct-field ct-span-2">Skills<textarea rows={3} value={profile.skills} onChange={event => setProfile({ ...profile, skills: event.target.value })} placeholder="Your skills, tools, and strengths, separated by commas" /></label></div></div><div className="ct-card ct-card-pad"><div className="ct-card-heading"><span className="ct-large-icon"><FileText size={22} /></span><div><h2>Your experience</h2><p>Your master resume powers the career toolkit.</p></div></div><label className="ct-field">Master resume<textarea rows={10} value={profile.resume} maxLength={60000} onChange={event => setProfile({ ...profile, resume: event.target.value })} placeholder="Paste your resume text…" /></label></div><div className="ct-card ct-card-pad"><div className="ct-card-heading"><span className="ct-large-icon"><Settings2 size={22} /></span><div><h2>Find your pace</h2><p>Set personal goals for your job search.</p></div></div><div className="ct-form-grid"><label className="ct-field">Daily application goal<input type="number" min={1} max={100} required value={preferences.dailyGoal} onChange={event => setPreferences({ ...preferences, dailyGoal: Number(event.target.value) })} /></label><label className="ct-field">Weekly application goal<input type="number" min={1} max={500} required value={preferences.weeklyGoal} onChange={event => setPreferences({ ...preferences, weeklyGoal: Number(event.target.value) })} /></label></div><div className="ct-toggle-row"><div><strong>Job digest interest</strong><p>Save your preference for a future email digest. Email delivery is not active.</p></div><input className="ct-checkbox" aria-label="Save interest in job digest" type="checkbox" checked={preferences.digest} onChange={event => setPreferences({ ...preferences, digest: event.target.checked })} /></div></div><div className="ct-save-bar"><p>Changes are saved to your account.</p><button className="ct-btn ct-btn-primary" disabled={busy || reviewBusy} type="submit"><BusyIcon busy={busy}><Save size={17} /></BusyIcon>Save profile & preferences</button></div></form><aside className="ct-stack"><div className="ct-card ct-card-pad ct-sage-card"><div className="ct-profile-avatar">{profile.name.split(" ").filter(Boolean).slice(0, 2).map(part => part[0]).join("") || <UserRound size={28} />}</div><h2>{profile.name || "Your next chapter"}</h2><p>{profile.headline || "A clearer profile. A more focused search."}</p><div className="ct-divider" /><div className="ct-row"><span className="ct-small">Profile completeness</span><strong>{Math.round(completed / 6 * 100)}%</strong></div><div className="ct-progress" role="progressbar" aria-label="Profile completeness" aria-valuenow={Math.round(completed / 6 * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${completed / 6 * 100}%` }} /></div><p className="ct-small">Add your name, headline, location, target roles, skills, and resume.</p></div><div className="ct-card ct-card-pad"><Sparkles size={23} className="ct-green" /><h3 className="ct-mt">A fresh perspective</h3><p>Get an AI review of your profile’s strengths, gaps, and next steps.</p><button className="ct-btn ct-btn-secondary ct-full" disabled={busy || reviewBusy || !capabilities.ai || !profile.resume.trim()} onClick={() => void reviewProfile()}><BusyIcon busy={reviewBusy}><Sparkles size={16} /></BusyIcon>Review my profile</button><p className="ct-small ct-muted">{!capabilities.ai ? "AI connection required." : !profile.resume.trim() ? "Add your resume to get started." : "AI guidance, not a human recruiter evaluation."}</p></div>{review && <div className="ct-card ct-card-pad"><div className="ct-row"><h3>Your profile review</h3><button className="ct-icon-btn" title="Download profile review" onClick={() => downloadText(review, "profile-evaluation.txt")}><ArrowDownToLine size={16} /></button></div><div className="ct-prose ct-small">{review}</div></div>}<div className="ct-subtle-note"><ShieldCheck size={20} /><p>Your profile helps tailor your documents. Changing your contact email here does not change your sign-in email.</p></div></aside></div></section>;
}

export function SupportCenter({ state, update, notify, navigate }: FeatureProps) {
  const [message, setMessage] = useState(""); const [service, setService] = useState(state.preferences.service); const [busy, setBusy] = useState("");
  const [topic, setTopic] = useState("General question");
  async function send(event: FormEvent) {
    event.preventDefault(); if (!message.trim()) return; setBusy("send");
    try { if (await update({ ...state, messages: [...state.messages, { id: uid(), text: `[${topic}]\n${message.trim()}`, author: "You", date: new Date().toISOString() }] })) { setMessage(""); notify("Your request was saved to the account’s support history."); } }
    finally { setBusy(""); }
  }
  async function requestService() {
    setBusy("service");
    try { if (await update({ ...state, preferences: { ...state.preferences, service }, messages: [...state.messages, { id: uid(), text: `Service interest: ${service}. Please review availability for my account.`, author: "You", date: new Date().toISOString() }] })) notify("Service interest saved. No purchase or subscription was created."); }
    finally { setBusy(""); }
  }
  function exportReport() {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const relevant = state.applications.filter(app => new Date(app.date).getTime() >= since || app.history.some(item => new Date(item.date).getTime() >= since));
    const csv = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const lines = ["Company,Role,Status,Date,Next step,Notes", ...relevant.map(app => [app.company, app.title, app.status, app.date, app.nextStep, app.notes].map(csv).join(","))];
    downloadText(lines.join("\r\n"), `careerpilot-weekly-report-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
    notify(`Weekly report downloaded with ${relevant.length} application records.`);
  }
  return <section className="ct-root"><PageTitle eyebrow="A LITTLE SUPPORT GOES A LONG WAY" title="Career support" description="Keep your questions, service requests, and progress in one place." /><div className="ct-split"><div className="ct-stack"><div className="ct-card ct-card-pad"><div className="ct-card-heading"><span className="ct-large-icon"><MessageSquare size={22} /></span><div><h2>Your support history</h2><p>Saved requests and actual team responses.</p></div></div><div className="ct-notice">Requests are saved for an authorized operator to review. A response time or staffed support service is not currently guaranteed.</div>{state.messages.length ? <div className="ct-message-list">{state.messages.map(item => <article className="ct-message" key={item.id}><div className="ct-row"><strong>{item.author}</strong><time className="ct-small ct-muted" dateTime={item.date}>{prettyDate(item.date)}</time></div><p>{item.text}</p></article>)}</div> : <Empty icon={<Headphones size={28} />} title="A space for your questions" body="Start a conversation about your profile, job search, or the application. Your saved requests will appear here." />}<form onSubmit={send}><label className="ct-field">What can we help with?<select value={topic} onChange={event => setTopic(event.target.value)}>{["General question", "Profile review request", "Resume feedback", "Application assistance", "Technical issue", "Billing question"].map(item => <option key={item}>{item}</option>)}</select></label><label className="ct-field">Your message<textarea required rows={4} maxLength={4500} value={message} onChange={event => setMessage(event.target.value)} placeholder="Share what you’re working on and where you’d like support…" /></label><div className="ct-form-footer"><span className="ct-small ct-muted">Avoid passwords or other sensitive credentials.</span><button className="ct-btn ct-btn-primary" disabled={!!busy || !message.trim()}><BusyIcon busy={busy === "send"}><Send size={16} /></BusyIcon>Save request</button></div></form></div><div className="ct-card ct-card-pad"><h2>A few useful answers</h2><div className="ct-faq"><details><summary>Does CareerPilot automatically apply to jobs?</summary><p>CareerPilot helps you find roles, prepare materials, and track applications. Open the employer’s application link to submit your application. Mark it applied only after you have completed the submission.</p></details><details><summary>How does resume tailoring work?</summary><p>With a configured AI connection, the studio compares your master resume to the job description and creates an editable draft. Review every claim before using it. AI cannot guarantee an ATS result or interview.</p></details><details><summary>Can I work with a human career specialist?</summary><p>You can record your service interest here. A managed service requires an available operator and a separate agreement. This workspace does not activate a subscription, charge you, or guarantee staffing.</p></details><details><summary>How can I take my documents with me?</summary><p>In Resume Studio, open a saved document and choose TXT or Print / PDF. Original uploaded PDFs can be downloaded when file storage is available.</p></details></div></div></div><aside className="ct-stack"><div className="ct-card ct-card-pad ct-sage-card"><Headphones size={26} className="ct-green" /><h2 className="ct-mt">A more supported search</h2><p>Tell us what kind of help you’re interested in.</p><label className="ct-field">Service preference<select value={service} onChange={event => setService(event.target.value)}>{["Self-service", "Profile evaluation", "Resume review", "Application assistance", "Interview coaching"].map(item => <option key={item}>{item}</option>)}</select></label><button className="ct-btn ct-btn-primary ct-full" disabled={!!busy} onClick={() => void requestService()}><BusyIcon busy={busy === "service"}><ArrowRight size={16} /></BusyIcon>Save service interest</button><p className="ct-small">Interest only. Human service availability and pricing must be confirmed separately.</p></div><div className="ct-card ct-card-pad"><ClipboardList size={24} className="ct-green" /><h3 className="ct-mt">Your week, at a glance</h3><p>Download applications created or updated during the last seven days.</p><button className="ct-btn ct-btn-secondary ct-full" onClick={exportReport}><ArrowDownToLine size={16} />Download weekly report</button><button className="ct-link ct-mt" onClick={() => navigate("applications")}>View all applications<ArrowRight size={14} /></button></div><div className="ct-card ct-card-pad"><div className="ct-row"><h3>Plan & billing</h3><span className="ct-small-badge">Not connected</span></div><p>Paid subscriptions and payment processing are not enabled in this workspace.</p><span className="ct-small ct-muted">No payment details are collected here.</span></div></aside></div></section>;
}

type AdminUser = { version: number; applications: Application[]; id: string; name: string; email: string; profile: Profile; applicationsCount: number; lastActivity: string; messages: SupportMessage[] };
type AdminPage = { error?: string; users?: AdminUser[]; nextOffset?: number | null };
export function OperatorConsole({ notify }: FeatureProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, ApplicationStatus>>({});
  const requestId = useRef(0);
  const refresh = useCallback(() => {
    const currentRequest = ++requestId.current;
    return fetch(`/api/admin?offset=${offset}`).then(async response => {
      const data = await response.json() as AdminPage;
      if (!response.ok) throw new Error(data.error || "Operator access is unavailable.");
      if (requestId.current !== currentRequest) return;
      setUsers(data.users || []); setNextOffset(data.nextOffset ?? null); setStatusDrafts({}); setError("");
    }).catch(err => { if (requestId.current === currentRequest) setError(err instanceof Error ? err.message : "The queue could not be loaded."); })
      .finally(() => { if (requestId.current === currentRequest) setBusy(false); });
  }, [offset]);
  useEffect(() => { void refresh(); return () => { requestId.current += 1; }; }, [refresh]);
  const active = users.find(user => user.id === selected);
  async function saveChange(change: { message?: string; applicationId?: string; status?: ApplicationStatus }) {
    if (!active || sending || busy) return;
    const candidate = active;
    const message = change.message;
    setSending(change.applicationId || "reply"); setError("");
    try {
      const response = await fetch("/api/admin", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: candidate.id, version: candidate.version, ...change }) });
      const data = await response.json() as { error?: string; version?: number };
      if (!response.ok) {
        if (response.status === 409) await refresh();
        throw new Error(data.error || "The update could not be saved.");
      }
      if (typeof data.version !== "number") throw new Error("The update response was incomplete. Refresh the queue before continuing.");
      const version = data.version;
      const date = new Date().toISOString();
      setUsers(current => current.map(user => user.id !== candidate.id ? user : {
        ...user, version, lastActivity: date,
        messages: message ? [...user.messages, { id: uid(), text: message, date, author: "CareerPilot team" }] : user.messages,
        applications: change.applicationId && change.status ? user.applications.map(application => application.id === change.applicationId ? { ...application, status: change.status!, history: [...application.history, { status: change.status!, date }].slice(-100) } : application) : user.applications,
      }));
      if (message) { setReply(""); notify("Response saved to the member’s support history."); }
      else { setStatusDrafts(current => { const next = { ...current }; delete next[change.applicationId!]; return next; }); notify("Application stage updated in the member’s tracker."); }
    } catch (err) { setError(err instanceof Error ? err.message : "The update could not be saved."); }
    finally { setSending(""); }
  }
  function changePage(value: number) { setBusy(true); setSelected(""); setReply(""); setUsers([]); setOffset(value); }
  const filtered = users.filter(user => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="ct-root">
    <PageTitle eyebrow="OPERATOR WORKSPACE" title="Member support" description="Review member profiles, application queues, and saved requests."><button className="ct-btn ct-btn-secondary" onClick={() => { setBusy(true); void refresh(); }} disabled={busy || !!sending}><BusyIcon busy={busy}><ClipboardList size={16} /></BusyIcon>Refresh queue</button></PageTitle>
    <ErrorNote text={error} /><div className="ct-notice"><ShieldCheck size={17} />This workspace requires a server-authorized operator account. Member data is private.</div>
    {busy && !users.length ? <div className="ct-loading"><LoaderCircle className="ct-spin" size={24} />Loading member queue…</div> : <div className="ct-library">
      <aside className="ct-card ct-library-list"><div className="ct-card-pad"><h2>Members <span className="ct-count">{users.length}</span></h2><label className="ct-field">Find a member on this page<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or email" /></label><div className="ct-inline-actions"><button className="ct-btn ct-btn-secondary ct-btn-small" disabled={offset === 0 || busy || !!sending} onClick={() => changePage(Math.max(0, offset - 30))}>Previous</button><span className="ct-small">Page {Math.floor(offset / 30) + 1}</span><button className="ct-btn ct-btn-secondary ct-btn-small" disabled={nextOffset === null || busy || !!sending} onClick={() => { if (nextOffset !== null) changePage(nextOffset); }}>Next</button></div></div>
      {filtered.length ? filtered.map(user => <button key={user.id} className={`ct-library-item ${selected === user.id ? "ct-library-active" : ""}`} disabled={!!sending || busy} onClick={() => { setSelected(user.id); setReply(""); setStatusDrafts({}); }}><span className="ct-file-icon"><UserRound size={19} /></span><span><strong>{user.name || user.email}</strong><small>{user.email}</small><small>{user.applicationsCount} applications · {user.messages.length} messages</small><small>{user.applications.filter(item => item.status === "In review").length} awaiting review</small></span></button>) : <Empty icon={<UserRound size={24} />} title={error ? "Queue unavailable" : "No members found"} body={error ? "Resolve the error above and refresh the queue." : "Try another page or search term. Members appear after they open a signed-in workspace."} />}</aside>
      <div className="ct-card ct-card-pad">{active ? <><div className="ct-row"><div><h2>{active.name}</h2><p>{active.email}</p></div><span className="ct-small-badge">{active.profile.onboardingComplete ? "Profile completed" : "Profile in progress"}</span></div>
        <div className="ct-generated"><h3>Profile context</h3><p>{active.profile.headline || "No headline added"}</p><p><strong>Target roles:</strong> {active.profile.roles || "Not specified"}</p>{active.profile.resume && <details><summary>Read master resume</summary><div className="ct-prose ct-small">{active.profile.resume}</div></details>}</div>
        <h3 className="ct-mt">Application review queue</h3><p className="ct-small ct-muted">Stage changes update the tracker. Select Applied only after an actual submission is confirmed.</p>
        {active.applications.length ? active.applications.map(application => <div className="ct-interview-item" key={application.id}><strong>{application.title}</strong><p>{application.company}</p>{application.notes && <p className="ct-small">{application.notes}</p>}<div className="ct-inline-actions"><label className="ct-field">Application stage<select value={statusDrafts[application.id] || application.status} disabled={!!sending || busy} onChange={event => setStatusDrafts(current => ({ ...current, [application.id]: event.target.value as ApplicationStatus }))}>{statuses.map(status => <option key={status}>{status}</option>)}</select></label><button className="ct-btn ct-btn-secondary ct-btn-small" disabled={!!sending || busy || !statusDrafts[application.id] || statusDrafts[application.id] === application.status} onClick={() => void saveChange({ applicationId: application.id, status: statusDrafts[application.id] })}><BusyIcon busy={sending === application.id}><Save size={15} /></BusyIcon>Save stage</button></div></div>) : <p className="ct-muted">No applications in this workspace.</p>}
        <h3 className="ct-mt">Conversation</h3>{active.messages.length ? <div className="ct-message-list">{active.messages.map(message => <article className="ct-message" key={message.id}><div className="ct-row"><strong>{message.author}</strong><time className="ct-small ct-muted" dateTime={message.date}>{prettyDate(message.date)}</time></div><p>{message.text}</p></article>)}</div> : <p className="ct-muted">No support messages yet.</p>}
        <form onSubmit={event => { event.preventDefault(); if (reply.trim()) void saveChange({ message: reply.trim() }); }}><label className="ct-field">Your response<textarea required rows={5} maxLength={4500} value={reply} disabled={!!sending || busy} onChange={event => setReply(event.target.value)} placeholder="Write specific feedback or a response to the member…" /></label><div className="ct-form-footer"><span className="ct-small ct-muted">Visible in the member’s Career support page.</span><button className="ct-btn ct-btn-primary" disabled={!!sending || busy || !reply.trim()}><BusyIcon busy={sending === "reply"}><Send size={16} /></BusyIcon>Save response</button></div></form>
      </> : <Empty icon={<CircleHelp size={30} />} title="Make someone’s next step clearer" body="Select a member to review their profile, applications, and support history." />}</div>
    </div>}
  </section>;
}
