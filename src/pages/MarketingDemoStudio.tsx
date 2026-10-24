import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, LockKeyhole, Play, RotateCcw, ShieldCheck, Sparkles, Target, Users } from "lucide-react";

// Self-contained fictional preview. No Supabase client, network calls, or live member records.
const scenes = ["Goal", "Monthly plan", "This week", "Schedule", "Accountability"] as const;
const milestones = [
  { month: "November", title: "Validate business idea", detail: "Interview 10 potential customers" },
  { month: "December", title: "Build a simple offer", detail: "Define pricing and create a landing page" },
  { month: "January", title: "Test with early customers", detail: "Run a pilot and collect feedback" },
  { month: "February", title: "Prepare launch", detail: "Refine service, sales and marketing" },
  { month: "March", title: "Launch the business", detail: "Open orders and review first results" },
];
const actions = ["Interview 3 prospective customers", "Outline my first service package", "Draft a one-page launch budget"];
const fictionalMessages = [
  { person: "Ada • Cohort Coach", text: "How is your launch plan coming along? Share your top task for this week.", mine: false },
  { person: "You • Demo participant", text: "I'm interviewing three potential customers and testing my offer.", mine: true },
  { person: "Ada • Cohort Coach", text: "Great. I'll check back after your customer interviews.", mine: false },
];
const today = new Date();
const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
const dateLabel = tomorrow.toLocaleDateString("en-NG", { weekday: "long", month: "short", day: "numeric" });

export default function MarketingDemoStudio() {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [clean, setClean] = useState(false);
  const [typed, setTyped] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [complete, setComplete] = useState<number[]>([]);
  const goal = "Launch my small business by March";
  const progress = useMemo(() => Math.round((complete.length / actions.length) * 100), [complete]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setScene(current => {
      if (current >= scenes.length - 1) { setPlaying(false); return current; }
      return current + 1;
    }), 3500);
    return () => window.clearInterval(id);
  }, [playing]);

  const reset = () => { setPlaying(false); setScene(0); setTyped(false); setScheduled(false); setComplete([]); };
  return (
    <div className="min-h-screen bg-[#071d18] text-[#f8f8ef]" data-testid="marketing-demo-studio">
      {!clean && <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm">
        <a href="/" className="inline-flex items-center gap-2 text-[#d7e7d4]"><ArrowLeft size={16}/> Back to GOALS</a>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setClean(true)} className="rounded-full border border-white/30 px-3 py-2">Clean recording view</button>
          <button onClick={reset} className="inline-flex items-center gap-2 rounded-full border border-white/30 px-3 py-2"><RotateCcw size={14}/> Reset</button>
          <button onClick={() => { setScene(0); setPlaying(true); }} className="inline-flex items-center gap-2 rounded-full bg-[#c8f31d] px-4 py-2 font-bold text-[#11201b]"><Play size={14}/> Play scenes</button>
        </div>
      </div>}
      {clean && <button onClick={() => setClean(false)} className="fixed bottom-3 right-3 z-50 rounded-full bg-[#112820] px-3 py-2 text-xs text-white/70 opacity-40 hover:opacity-100">Exit clean view</button>}
      <main className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-3 pb-12 pt-3 md:pt-8">
        {!clean && <div className="max-w-xl text-center">
          <div className="mb-2 inline-flex items-center gap-2 text-xs text-[#c8f31d]"><LockKeyhole size={14}/> Synthetic data only · No production actions</div>
          <h1 className="text-2xl font-extrabold md:text-3xl">GOALS Marketing Demo Studio</h1>
          <p className="mt-2 text-sm text-[#c7d3c9]">A fictional, repeatable walkthrough for video production. AI responses are scripted examples, not live generation.</p>
        </div>}
        <div className="relative w-full max-w-[420px] overflow-hidden rounded-[28px] border border-white/20 bg-[#f7f8f1] text-[#102820] shadow-2xl">
          <div className="flex items-center justify-between bg-[#0d3227] px-5 py-4 text-white">
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#c8f31d]">Discover Your Purpose</p><p className="text-lg font-extrabold">GOALS <span className="font-normal opacity-70">/ Journey</span></p></div>
            <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold">DEMO</div>
          </div>
          <div className="min-h-[570px] p-5" aria-live="polite">
            <div className="mb-5 flex items-center justify-between text-xs text-[#6a7d72]"><span>Step {scene + 1} of {scenes.length}</span><span className="rounded-full bg-[#e1f0ca] px-2 py-1 font-semibold text-[#31502a]">Illustrative preview</span></div>
            <div className="mb-5 flex gap-1">{scenes.map((s, i) => <button key={s} aria-label={s} onClick={() => {setPlaying(false);setScene(i);}} className={`h-1.5 flex-1 rounded-full ${i <= scene ? "bg-[#7ca318]" : "bg-[#dce3d7]"}`}/>)}</div>
            {scene === 0 && <section>
              <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#648b19]"><Target size={16}/> My GOALS</div>
              <h2 className="text-2xl font-extrabold">Every plan starts with a goal.</h2>
              <p className="mt-2 text-sm text-[#607165]">What would you like to achieve?</p>
              <div className="mt-6 rounded-xl border border-[#c5d4c6] bg-white p-4 text-lg font-semibold">{typed ? goal : "I want to launch my business by March."}</div>
              <button onClick={() => setTyped(true)} className="mt-5 w-full rounded-xl bg-[#153d2c] p-3 text-sm font-bold text-white">{typed ? "Goal added ✓" : "Add my goal"} </button>
              {typed && <p className="mt-4 flex items-center gap-2 text-sm text-[#3e762f]"><CheckCircle2 size={17}/> Goal ready for planning</p>}
            </section>}
            {scene === 1 && <section>
              <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#648b19]"><Sparkles size={16}/> AI planning example</div>
              <h2 className="text-2xl font-extrabold">Your goal. Broken into steps.</h2>
              <p className="mt-2 text-sm text-[#607165]">{goal}</p>
              <div className="mt-5 space-y-2">{milestones.map((m, i) => <div key={m.month} className="flex gap-3 rounded-xl border border-[#e0e8d9] bg-white p-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dff2c2] text-xs font-bold">{i + 1}</div><div><div className="text-xs font-semibold text-[#5b8321]">{m.month}</div><div className="text-sm font-bold">{m.title}</div><div className="text-xs text-[#68796e]">{m.detail}</div></div></div>)}</div>
            </section>}
            {scene === 2 && <section>
              <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#648b19]"><CheckCircle2 size={16}/> Weekly execution</div>
              <h2 className="text-2xl font-extrabold">What do I do this week?</h2>
              <p className="mt-2 text-sm text-[#607165]">A sample weekly action plan based on your first milestone.</p>
              <div className="mt-5 rounded-xl bg-[#e4efd6] p-4"><div className="flex items-center justify-between text-sm font-bold"><span>Weekly progress</span><span>{progress}%</span></div><div className="mt-2 h-2 rounded-full bg-white"><div className="h-full rounded-full bg-[#7da920]" style={{width:`${progress}%`}}/></div></div>
              <div className="mt-4 space-y-3">{actions.map((a,i)=><button key={a} onClick={()=>setComplete(c=>c.includes(i)?c.filter(n=>n!==i):[...c,i])} className="flex w-full items-center gap-3 rounded-xl border border-[#d6e0d2] bg-white p-4 text-left text-sm font-semibold"><span className={`flex h-5 w-5 items-center justify-center rounded-md border ${complete.includes(i)?"border-[#5d8d1b] bg-[#5d8d1b] text-white":"border-[#a3b69f]"}`}>{complete.includes(i)?"✓":""}</span>{a}</button>)}</div>
            </section>}
            {scene === 3 && <section>
              <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#648b19]"><CalendarDays size={16}/> My Planner</div>
              <h2 className="text-2xl font-extrabold">Tomorrow, 9 a.m.?</h2>
              <p className="mt-2 text-sm text-[#607165]">Schedule time for the actions that matter.</p>
              <div className="mt-6 rounded-xl border border-[#cfdecf] bg-white p-5"><div className="text-xs font-bold uppercase text-[#618024]">{dateLabel}</div><div className="mt-3 flex items-center gap-2 text-xl font-bold"><Clock3 size={20}/> 9:00 AM — 10:00 AM</div><div className="mt-3 border-l-4 border-[#a4d023] bg-[#f2f8e9] p-3 text-sm font-semibold">Interview prospective customers</div></div>
              <button onClick={()=>setScheduled(true)} className="mt-5 w-full rounded-xl bg-[#153d2c] p-3 text-sm font-bold text-white">{scheduled?"Scheduled in demo planner ✓":"Schedule this task"}</button>
              <p className="mt-3 text-xs text-[#6c796f]">Inside-GOALS demonstration only. No external calendar event is created.</p>
            </section>}
            {scene === 4 && <section>
              <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#648b19]"><Users size={16}/> Accountability Lab</div>
              <h2 className="text-2xl font-extrabold">And someone checks on me.</h2>
              <p className="mt-2 text-sm text-[#607165]">Example group: GOALS ALPHA · All messages are fictional.</p>
              <div className="mt-6 space-y-4">{fictionalMessages.map((m,i)=><div key={i} className={`max-w-[93%] rounded-2xl p-4 ${m.mine?"ml-auto bg-[#dff2c2]":"bg-white shadow-sm"}`}><p className="mb-2 text-[11px] font-bold text-[#618327]">{m.person}</p><p className="text-sm leading-relaxed">{m.text}</p></div>)}</div>
              <p className="mt-6 text-center text-xs font-semibold text-[#6d796e]">Progress grows with accountability.</p>
            </section>}
          </div>
          <div className="flex items-center justify-between border-t border-[#e0e9df] px-5 py-4"><button onClick={()=>{setPlaying(false);setScene(n=>Math.max(0,n-1));}} disabled={scene===0} className="text-sm font-semibold disabled:opacity-30"><ArrowLeft className="inline h-4 w-4"/> Back</button><span className="text-[11px] text-[#6f7b70]">FICTIONAL DEMO</span><button onClick={()=>{setPlaying(false);setScene(n=>(n+1)%scenes.length);}} className="text-sm font-bold text-[#416f18]">{scene===scenes.length-1?"Replay":"Next"} <ArrowRight className="inline h-4 w-4"/></button></div>
        </div>
        {!clean && <p className="flex max-w-lg items-start gap-2 text-center text-xs text-[#b4cbb6]"><ShieldCheck size={16} className="shrink-0"/> This route is a fictional interface preview. It does not authenticate, connect to live GOALS data, call AI services, send messages, or write tasks.</p>}
      </main>
    </div>
  );
}
