// No model permissions anywhere in AWS (C11-D06, C11-D75; D41: stages C0 to C6 make no model calls).
// These two lists are the one place the landing zone names AI and machine-learning services. From
// C0.11 PR 2 the hearth-no-models SCP at Root, every permission set's inline deny (management's only
// fence for people, since SCPs never bind it), the break-glass role's deny, the bootstrap template's
// deny on every bootstrap role, hearth-boundary, IAC-01 and IAC-24 render or read them, and IG-10
// refuses a model action anywhere else in infra/. A0 lifts in-region Bedrock by a reviewed change to
// these lists and the policies that read them, never by a flag.
//
// How the lists are checked, so the next check can be repeated: AWS's Service Authorization
// Reference, in its machine-readable form (servicereference.us-east-1.amazonaws.com), lists every
// service prefix and action name. Every prefix and every action name in it is scanned for these
// words, case-insensitively: agent, assist, chat, completion, conversation, generat, infer, mcp, ml,
// model, predict, prompt, q (as a word part, such as QSql), recommend, summar, transcri, voice. Each
// hit is read: a service whose purpose is a model, an AI agent or machine learning joins
// MODEL_SERVICE_PREFIXES; a model feature inside another service joins MODEL_ACTIONS as a pattern,
// which must match at least one action the reference names and nothing that isn't the feature (IAM
// matches case-insensitively, so `*ML*` would also catch Glue's GetSystemLogsForJobRun); and what was
// read and left is named below with why. A newly found service or action joins its list, as a newly
// found package joins scripts/guards/ai-free.ts.
//
// Last check, 30 Oct 2026, over all 457 services: every prefix below is one AWS publishes, and every
// action pattern matches at least one action it publishes. The design's `qconnect` is no prefix
// (Amazon Q in Connect's actions are `wisdom:`), nor is `bedrock-data-automation` (its actions are
// `bedrock:`, denied whole). Read and left:
// - machine learning on AWS's own telemetry, never content (the D41 note: GuardDuty; CloudWatch Logs'
//   and Cost Explorer's anomaly detection; IoT Device Defender's behaviour models), and the rule-based
//   recommenders (Compute Optimizer, Trusted Advisor, Cost Optimization Hub and the like);
// - Support Console's GetIssueTextSummary and GetIssueClassificationPredictions, which may be model
//   calls but sit in the flow of opening a support case, which an incident may need;
// - IAM's GetHumanReadableSummary, Glue's GetGeneratedCode and WorkSpaces' troubleshooting
//   recommendations, whose names alone don't show a model call (the machine-readable reference
//   describes no action);
// - Macie (sensitive-data discovery) and Entity Resolution (record matching), whose machine learning
//   sits inside a data service rather than being a model offered to callers, for C0.13's general
//   statement on AWS's own machine learning (the D41 note) to settle;
// - chatbot, whose actions only configure chat channels (asking Amazon Q there needs `q:`).
// The owner decides these with PR 2 (TECH-SPEC T24, C11-D06).
// This file is on the owner's-read list (C11-D74).

// Whole services whose purpose is a model, an AI agent or machine learning: every action under each
// prefix is denied (`<prefix>:*`).
export const MODEL_SERVICE_PREFIXES = [
  // Foundation models, their agents and tools.
  'bedrock',
  'bedrock-agentcore',
  'bedrock-mantle',
  'bedrock-websearch',
  'aws-external-anthropic',
  'nova-act',
  // Machine learning platforms.
  'sagemaker',
  'sagemaker-data-science-assistant',
  'sagemaker-geospatial',
  'sagemaker-mlflow',
  'sagemaker-unified-studio-mcp',
  'groundtruthlabeling',
  'machinelearning',
  'cleanrooms-ml',
  // Language, speech and vision. Voice ID makes voiceprints, which D34 bans.
  'comprehend',
  'comprehendmedical',
  'transcribe',
  'textract',
  'rekognition',
  'polly',
  'translate',
  'lex',
  'voiceid',
  'kendra',
  'kendra-ranking',
  // Prediction and detection.
  'personalize',
  'forecast',
  'frauddetector',
  'lookoutvision',
  'lookoutmetrics',
  'lookoutequipment',
  'monitron',
  'panorama',
  'healthlake',
  'health-agent',
  // Assistants and agents.
  'q',
  'qbusiness',
  'qapps',
  'qdeveloper',
  'wisdom',
  'codewhisperer',
  'codeguru',
  'codeguru-reviewer',
  'codeguru-security',
  'codeguru-profiler',
  'devops-guru',
  'aiops',
  'aidevops',
  'finops-agent',
  'securityagent',
  'transform',
  'transform-custom',
  // Amazon Quick Suite (QuickSight's prefix), whose agents, chat, flows, automations, spaces,
  // knowledge bases and Q topics run on models; Hearth plans no BI service, so it is denied whole.
  'quicksight',
  // App Studio, which builds apps from natural language with a model.
  'appstudio',
  // Assistants inside other consoles that are services of their own: Network Manager's chat and
  // Elemental Inference's media models.
  'networkmanager-chat',
  'elemental-inference',
  // Agents' tools: the agent registry, WorkSpaces AgentAccess (an agent driving a desktop: screenshots,
  // clicks and keys), and the MCP servers AWS runs for agents.
  'agent-registry',
  'agentaccess-mcp',
  'ecs-mcp',
  'eks-mcp',
  'application-signals-mcp',
] as const

// Model features inside services that are otherwise allowed, which a prefix list misses:
// - natural-language query generation and result summaries in CloudWatch Logs Insights and
//   CloudTrail Lake, which send prompts and log or event context to a model, and which ReadOnlyAccess
//   and AdministratorAccess grant;
// - Detective's and IoT SiteWise's assistants, the Assurance service's chat, and the agents in
//   WorkSpaces' onboarding and the Well-Architected Tool;
// - the Chime SDK's voice analytics, call analytics and meeting transcription (which runs Amazon
//   Transcribe for the caller): voiceprints, AI scoring of speech and speech-to-text, which D34 and
//   D41 ban;
// - Amazon Connect's Contact Lens analytics (AI scoring of speech, D34) and AI agents;
// - Amazon Q's code, metadata and SQL generation, agents and chat in DataZone (SageMaker Unified
//   Studio), Glue (with Glue's own machine-learning transforms) and the SQL Workbench;
// - Neptune ML's model training, transforms and endpoints.
export const MODEL_ACTIONS = [
  'cloudwatch:GenerateQuery',
  'cloudwatch:GenerateQueryResultsSummary',
  'cloudtrail:GenerateQuery',
  'cloudtrail:GenerateQueryResultsSummary',
  'detective:InvokeAssistant',
  'iotsitewise:InvokeAssistant',
  'assurance:*Chat*',
  'workspaces:InvokeOnboardingAgent',
  'wellarchitected:*Agent*',
  'chime:*SpeakerSearch*',
  'chime:*VoiceToneAnalysis*',
  'chime:*VoiceProfile*',
  'chime:*MediaInsightsPipeline*',
  'chime:*MeetingTranscription*',
  'connect:*ContactAnalysis*',
  'connect:*ConversationalAnalytics*',
  'connect:*AIAgent*',
  'connect:*AIVersion*',
  'datazone:*Agent*',
  'datazone:*Conversation*',
  'datazone:*MetadataGeneration*',
  'datazone:*Predictions',
  'datazone:GenerateCode',
  'glue:*Completion',
  'glue:*MLTransform*',
  'glue:*MLTask*',
  'glue:StartML*',
  'sqlworkbench:*QSql*',
  'sqlworkbench:*QCustomContext*',
  'sqlworkbench:*SqlGeneration*',
  'sqlworkbench:GetSqlRecommendations',
  'neptune-db:*MLModel*',
  'neptune-db:*MLEndpoint*',
  'neptune-db:*MLDataProcessing*',
] as const

export type ModelServicePrefix = (typeof MODEL_SERVICE_PREFIXES)[number]
export type ModelAction = (typeof MODEL_ACTIONS)[number]

// The actions a model deny names, in the lists' order: every prefix as `<prefix>:*`, then each
// model action as written. An SCP, a permission set's inline policy, a role's deny and the
// bootstrap template's deny all render this one list.
export function modelDenyActions(): string[] {
  return [...MODEL_SERVICE_PREFIXES.map(prefix => `${prefix}:*`), ...MODEL_ACTIONS]
}

// Whether an IAM action pattern (as an Allow writes it: `s3:GetObject`, `bedrock:*`, `*`,
// `cloudwatch:Generate*`) could grant a model action. IAM matches actions case-insensitively, with
// `*` for any run of characters and `?` for one. A pattern overlaps a denied prefix when its service
// part matches the prefix; it overlaps a model action when the two patterns can match one name.
export function grantsModelAction(pattern: string): boolean {
  const lower = pattern.toLowerCase()
  if (lower === '*') return true
  const colon = lower.indexOf(':')
  if (colon < 0) return false
  const service = lower.slice(0, colon)
  if (MODEL_SERVICE_PREFIXES.some(prefix => globsOverlap(service, prefix))) return true
  return MODEL_ACTIONS.some(action => globsOverlap(lower, action.toLowerCase()))
}

// Whether two IAM-style globs (`*` any run, `?` one character, everything else literal) can match
// one string. A small dynamic programme over both patterns.
export function globsOverlap(a: string, b: string): boolean {
  const memo = new Map<string, boolean>()
  const walk = (i: number, j: number): boolean => {
    const key = `${i},${j}`
    const known = memo.get(key)
    if (known !== undefined) return known
    let result: boolean
    if (i === a.length && j === b.length) result = true
    else if (i < a.length && a[i] === '*') result = walk(i + 1, j) || (j < b.length && walk(i, j + 1))
    else if (j < b.length && b[j] === '*') result = walk(i, j + 1) || (i < a.length && walk(i + 1, j))
    else if (i === a.length || j === b.length) result = false
    else result = (a[i] === b[j] || a[i] === '?' || b[j] === '?') && walk(i + 1, j + 1)
    memo.set(key, result)
    return result
  }
  return walk(0, 0)
}
