import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, Code2, FileCheck2, GitBranch, Network, Search, Timer } from "lucide-react";

const fitSteps = [
  {
    title: "Existing agent runtime",
    detail: "Keep your model provider, tools, vector database, scheduler, and orchestration layer.",
    icon: Bot
  },
  {
    title: "Memory event",
    detail: "Capture the moments where the agent creates or updates memory that should be reviewable.",
    icon: GitBranch
  },
  {
    title: "VAMVault proof anchor",
    detail: "Upload or fallback-hash the artifact, then anchor the root and content proof for the agent.",
    icon: FileCheck2
  },
  {
    title: "Continue normal agent loop",
    detail: "Your workflow keeps running, now with verifiable memory evolution available for inspection.",
    icon: CheckCircle2
  }
];

const researchFlow = [
  "Research Agent",
  "Create Memory",
  "Anchor Memory",
  "Update Memory",
  "Transition Explorer",
  "Verify Evolution"
];

const agentWorkflowPattern = [
  "Agent Runtime",
  "Memory Event",
  "Memory Anchor",
  "Continue Agent Loop",
  "Transition Explorer",
  "Verify Evolution"
];

const adoptionSteps = [
  "Agent runs normally inside your current runtime.",
  "Agent creates or updates memory that should be reviewable.",
  "Memory is anchored through VAMVault as a verifiable state reference.",
  "Agent continues without interruption after the anchor step.",
  "Builder later inspects memory evolution in Transition Explorer."
];

const anchorReasons = [
  {
    title: "Research Agent",
    event: "New conclusion",
    reason: "Verify how conclusions evolved over time"
  },
  {
    title: "Coding Agent",
    event: "Code change rationale",
    reason: "Audit why implementation decisions were made"
  },
  {
    title: "Multi-Agent Handoff",
    event: "State transfer between agents",
    reason: "Verify exactly what information was handed off"
  },
  {
    title: "Autonomous Analyst",
    event: "Risk assessment update",
    reason: "Understand why decisions changed later"
  }
];

const integrationPatterns = [
  {
    title: "Research Agent",
    when: "After each sourced research note or conclusion.",
    anchor: "Question, evidence summary, citation notes, and final memory state.",
    icon: Search
  },
  {
    title: "Coding Agent",
    when: "Before and after a plan, patch, review, or release note.",
    anchor: "Task state, code rationale, test summary, and follow-up memory.",
    icon: Code2
  },
  {
    title: "Multi-Agent Handoff",
    when: "When one agent passes task state to another agent.",
    anchor: "Sender state, handoff summary, receiver assumptions, and accepted memory root.",
    icon: Network
  },
  {
    title: "Autonomous Analyst",
    when: "When forecasts, classifications, or risk notes change.",
    anchor: "Input snapshot, analysis memory, update reason, and verification checkpoint.",
    icon: FileCheck2
  }
];

const gettingStartedSteps = [
  "Connect a funded 0G wallet.",
  "Register the agent identity once.",
  "Create a memory event from your existing agent runtime.",
  "Anchor the memory proof without changing the agent loop.",
  "Update memory as the agent learns, then inspect the path in Transition Explorer."
];

export default function BuilderIntegrationPage() {
  return (
    <main className="theme-dark min-h-screen overflow-hidden">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-8 sm:py-8 lg:px-10">
        <header className="premium-card relative overflow-hidden rounded-lg p-5 sm:p-7 lg:p-9">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex max-w-4xl flex-col gap-5 sm:flex-row sm:items-start">
              <div className="relative hidden h-[78px] w-[250px] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#050a13]/80 px-3 shadow-2xl shadow-cyan-950/30 sm:flex">
                <Image
                  alt="Verifiable Agent Memory Vault"
                  className="h-auto w-full object-contain"
                  height={500}
                  priority
                  src="/brand/vamv-logo-transparent.png"
                  width={1600}
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-copper">Builder Integration</p>
                <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-[1.03] text-white sm:text-6xl">
                  Add verifiable memory without replacing your agent stack.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
                  VAMVault fits beside your existing agent runtime as a memory proof layer. Keep your tools, models, and
                  orchestration. Anchor the memory events that explain important agent behavior.
                </p>
              </div>
            </div>
            <Link
              className="focus-ring soft-transition inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white hover:border-cyan-200/40 hover:bg-white/[0.08] sm:w-auto"
              href="/"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to app
            </Link>
          </div>
        </header>

        <section className="premium-card rounded-lg p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Where It Fits</p>
              <h2 className="mt-1.5 text-2xl font-semibold leading-8 text-white">Use VAMVault when memory changes need a trail</h2>
            </div>
            <p className="max-w-lg text-sm leading-6 text-slate-400">
              The agent keeps working the same way. VAMVault records the state changes a builder may need to verify later.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-4">
            {fitSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  className="soft-transition relative rounded-md border border-white/10 bg-white/[0.035] p-4 hover:border-cyan-200/30 hover:bg-white/[0.06]"
                  key={step.title}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-200/10 text-cyan-100">
                      <Icon className="h-5 w-5" />
                    </span>
                    {index < fitSteps.length - 1 ? <ArrowRight className="mt-2 hidden h-4 w-4 text-slate-500 lg:block" /> : null}
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{step.detail}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="premium-card rounded-lg p-5 sm:p-6">
          <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-4">
            <p className="text-sm font-semibold text-emerald-100">Research Agent example</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {researchFlow.map((step, index) => (
                <div className="flex items-center gap-2" key={step}>
                  <span className="rounded-md border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-white">
                    {step}
                  </span>
                  {index < researchFlow.length - 1 ? <ArrowRight className="h-4 w-4 text-emerald-200/70" /> : null}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            {[
              "Summarize source material into a memory event.",
              "Anchor the memory root and content hash.",
              "Update memory after new evidence arrives.",
              "Inspect previous and new states in Transition Explorer.",
              "Verify the stored artifact when indexing is reachable."
            ].map((step, index) => (
              <div className="rounded-md border border-white/10 bg-white/[0.035] p-3" key={step}>
                <span className="text-xs font-semibold text-cyan-200/80">0{index + 1}</span>
                <p className="mt-1 text-sm leading-6 text-slate-300">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="premium-card rounded-lg p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Copy the Pattern Into Your Agent</p>
              <h2 className="mt-1.5 text-2xl font-semibold leading-8 text-white">Add the anchor step where memory changes</h2>
            </div>
            <p className="max-w-lg text-sm leading-6 text-slate-400">
              Start with one memory event in the workflow you already run. VAMVault sits after the memory update and before
              the agent continues.
            </p>
          </div>

          <div className="rounded-md border border-cyan-200/20 bg-cyan-200/[0.06] p-4">
            <div className="flex flex-wrap items-center gap-2">
              {agentWorkflowPattern.map((step, index) => (
                <div className="flex items-center gap-2" key={step}>
                  <span className="rounded-md border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-white">
                    {step}
                  </span>
                  {index < agentWorkflowPattern.length - 1 ? <ArrowRight className="h-4 w-4 text-cyan-200/70" /> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {adoptionSteps.map((step, index) => (
              <div className="rounded-md border border-white/10 bg-white/[0.035] p-3" key={step}>
                <span className="text-xs font-semibold text-cyan-200/80">0{index + 1}</span>
                <p className="mt-1 text-sm leading-6 text-slate-300">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="premium-card rounded-lg p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Why Anchor This Memory?</p>
              <h2 className="mt-1.5 text-2xl font-semibold leading-8 text-white">Choose memory events that explain later behavior</h2>
            </div>
            <p className="max-w-lg text-sm leading-6 text-slate-400">
              Anchor a memory when a future builder, reviewer, or agent needs to understand why state changed.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {anchorReasons.map((item) => (
              <div className="rounded-md border border-white/10 bg-white/[0.035] p-4" key={item.title}>
                <h3 className="text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  <span className="font-semibold text-slate-200">Memory Event:</span> {item.event}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  <span className="font-semibold text-slate-200">Why Anchor:</span> {item.reason}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="premium-card rounded-lg p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Why Verifiable Memory?</p>
            <h2 className="mt-1.5 text-2xl font-semibold leading-8 text-white">Why Verifiable Memory Matters</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              When an agent&apos;s past state influences a future decision, the memory should be provable.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
              <h3 className="text-base font-semibold text-white">Traditional Agent Memory</h3>
              <div className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
                <p>Trust the database</p>
                <p>State changes are difficult to audit</p>
                <p>Memory history can be modified without proof</p>
                <p>Hard to verify how an agent arrived at a decision</p>
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
              <h3 className="text-base font-semibold text-white">Verifiable Agent Memory Vault</h3>
              <div className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
                <p>Verify memory state independently</p>
                <p>State transitions are traceable</p>
                <p>Memory evolution is anchored with proofs</p>
                <p>Builders can inspect how agent memory changed over time</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="premium-card rounded-lg p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Integration Patterns</p>
            <h2 className="mt-1.5 text-2xl font-semibold leading-8 text-white">Anchor the moments that explain agent behavior</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {integrationPatterns.map((pattern) => {
                const Icon = pattern.icon;
                return (
                  <div
                    className="soft-transition rounded-md border border-white/10 bg-white/[0.035] p-4 hover:border-cyan-200/35 hover:bg-white/[0.06]"
                    key={pattern.title}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-200/10 text-cyan-100">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-3 text-base font-semibold text-white">{pattern.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400"><span className="font-semibold text-slate-200">When:</span> {pattern.when}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400"><span className="font-semibold text-slate-200">Anchor:</span> {pattern.anchor}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="premium-card rounded-lg p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Timer className="h-5 w-5 text-copper" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">5 Minute Getting Started</p>
            </div>
            <h2 className="mt-3 text-2xl font-semibold leading-8 text-white">Start with one meaningful memory update</h2>
            <div className="mt-5 space-y-3">
              {gettingStartedSteps.map((step, index) => (
                <div className="flex gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3" key={step}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-copper/20 text-xs font-semibold text-copper">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-slate-300">{step}</p>
                </div>
              ))}
            </div>
            <Link
              className="focus-ring soft-transition mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-cyan-200 px-4 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/20"
              href="/"
            >
              Open VAMVault
              <ArrowRight className="h-4 w-4" />
            </Link>
          </aside>
        </section>
      </section>
    </main>
  );
}
