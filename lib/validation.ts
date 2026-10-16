import { z } from 'zod';

const short = z.string().max(300);
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const date = z.string().max(100);
export const statusSchema = z.enum(['Saved', 'In review', 'Ready to apply', 'Applied', 'Interview', 'Offer', 'Closed']);
export const httpsUrl = z.string().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}, 'Use a complete HTTPS link.');

export const stateSchema = z.object({
  profile: z.object({
    name: short, email: z.string().max(320), headline: z.string().max(1000), location: short,
    roles: z.string().max(2000), experience: z.string().max(10000), skills: z.string().max(10000),
    salary: short, workAuthorization: short, workplace: short, resume: z.string().max(60000),
    linkedin: httpsUrl, onboardingComplete: z.boolean(),
  }).strict(),
  jobs: z.array(z.object({
    id, title: short, company: short, location: short, workplace: short, salary: short,
    description: z.string().max(40000), url: httpsUrl, tags: z.array(short).max(20),
    saved: z.boolean(), source: short, addedAt: date,
  }).strict()).max(250),
  applications: z.array(z.object({
    id, jobId: z.string().max(100), title: short, company: short, status: statusSchema,
    notes: z.string().max(10000), date, nextStep: z.string().max(2000),
    history: z.array(z.object({ status: short, date }).strict()).max(100),
  }).strict()).max(300),
  documents: z.array(z.object({
    id, title: short, type: z.enum(['Resume', 'Cover letter', 'Outreach', 'Review']),
    content: z.string().max(60000), jobId: z.string().max(100), createdAt: date,
    fileId: id.optional(), fileName: short.optional(),
  }).strict()).max(100),
  interviews: z.array(z.object({
    id, company: short, role: short, date, type: short, notes: z.string().max(10000),
    questions: z.string().max(30000), feedback: z.string().max(30000),
  }).strict()).max(150),
  messages: z.array(z.object({ id, text: z.string().max(5000), date, author: short }).strict()).max(500),
  preferences: z.object({
    dailyGoal: z.number().int().min(1).max(100), weeklyGoal: z.number().int().min(1).max(500),
    digest: z.boolean(), service: short,
  }).strict(),
  demoLoaded: z.boolean(),
}).strict().superRefine((state, context) => {
  for (const field of ['jobs', 'applications', 'documents', 'interviews', 'messages'] as const) {
    if (new Set(state[field].map(item => item.id)).size !== state[field].length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'Each item needs a unique ID.' });
    }
  }
});

export const stateUpdateSchema = z.object({ state: stateSchema, version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1) }).strict();
export const aiSchema = z.object({
  task: z.enum(['tailor', 'cover-letter', 'ats', 'interview', 'outreach', 'profile-review', 'feedback', 'parse-resume']),
  resume: z.string().max(60000).optional(), jobDescription: z.string().max(40000).optional(),
  role: short.optional(), company: short.optional(), answer: z.string().max(15000).optional(),
  question: z.string().max(5000).optional(), fileId: id.optional(),
}).strict().superRefine((input, context) => {
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (input.task === 'parse-resume' && !input.fileId && !input.resume?.trim()) issue('Upload a resume or paste its text first.');
  if (['tailor', 'cover-letter', 'ats', 'profile-review', 'outreach'].includes(input.task) && !input.resume?.trim()) issue('Add your resume or profile details first.');
  if (['tailor', 'cover-letter', 'ats'].includes(input.task) && !input.jobDescription?.trim()) issue('Add a job description first.');
  if (input.task === 'interview' && !input.role?.trim() && !input.jobDescription?.trim()) issue('Add a role or job description first.');
  if (input.task === 'feedback' && (!input.answer?.trim() || !input.question?.trim())) issue('Add an interview question and your answer first.');
  if (input.fileId && input.task !== 'parse-resume') issue('Files are only supported for resume extraction.');
});
export type AIInput = z.infer<typeof aiSchema>;

export const adminUpdateSchema = z.object({
  userId: z.string().min(1).max(300), version: z.number().int().min(0),
  message: z.string().trim().min(1).max(5000).optional(),
  applicationId: id.optional(), status: statusSchema.optional(),
}).strict().refine(input => Boolean(input.message || (input.applicationId && input.status)), 'Add feedback or select an application status.')
  .refine(input => Boolean(input.applicationId) === Boolean(input.status), 'Application ID and status must be supplied together.');
