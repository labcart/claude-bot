# Engineering Principles

**Purpose**: A guide to engineering practices that prioritize reliability, maintainability, and professional discipline.

**Audience**: Developers joining projects where code quality and long-term sustainability matter.

---

## Core Philosophy

> **"Show, don't tell. Prove, don't assume."**

Code that works in production is worth infinitely more than code that "should work" in theory. Every feature should be testable, every test should be documented, and every claim should be backed by evidence.

---

## 1. Progressive Feature Validation

### ❌ Don't Do This
```javascript
// Feature 1: Add user authentication
function authenticate(user) {
  // ... 200 lines of code ...
}

// Feature 2: Add password reset
function resetPassword(email) {
  // ... 150 lines of code ...
}

// Feature 3: Add 2FA
function setupTwoFactor(user) {
  // ... 180 lines of code ...
}

// Commit everything, hope it works
git commit -m "Added auth features"
```

**Problems**:
- No idea which parts work
- Can't isolate failures
- Debugging is nightmare mode
- No confidence in deployment

### ✅ Do This Instead
```javascript
// Feature 1: Add user authentication
function authenticate(user) {
  // ... implementation ...
}

// Test it IMMEDIATELY
console.log('Testing authentication...');
const testUser = { username: 'test', password: 'test123' };
const result = authenticate(testUser);
console.log('✅ Authentication works:', result);

// Document what you verified
// - [x] User can log in with valid credentials
// - [x] Invalid credentials are rejected
// - [x] Session token is generated

// NOW move to Feature 2
```

**Benefits**:
- Know exactly what works
- Catch bugs immediately
- Build confidence incrementally
- Easy to debug (small changes)

---

## 2. Continuous Validation Loop

Every feature follows this cycle:

```
1. BUILD   → Write the feature
2. TEST    → Prove it works
3. VERIFY  → Check edge cases
4. OBSERVE → See it in action
5. DOCUMENT → Record what you proved
```

### Example: Adding Request Queue

**❌ Traditional Approach**:
```javascript
// Just write it and ship it
class RequestQueue {
  constructor() {
    this.queue = [];
  }
  async add(fn) {
    return await fn(); // Hope it works!
  }
}
```

**✅ Professional Approach**:
```javascript
// 1. BUILD
class RequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async add(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.processNext();
    });
  }

  async processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    const { requestFn, resolve, reject } = this.queue.shift();
    try {
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      this.processNext();
    }
  }
}

// 2. TEST
console.log('Testing queue with 3 concurrent requests...');
const queue = new RequestQueue();
const start = Date.now();

Promise.all([
  queue.add(async () => { await sleep(100); return 'req-1'; }),
  queue.add(async () => { await sleep(100); return 'req-2'; }),
  queue.add(async () => { await sleep(100); return 'req-3'; }),
]).then(results => {
  const duration = Date.now() - start;
  console.log(`✅ Queue processed ${results.length} requests`);
  console.log(`✅ Results: ${results.join(', ')}`);
  console.log(`✅ Duration: ${duration}ms (should be ~300ms for sequential)`);

  // 3. VERIFY
  if (duration < 250 || duration > 350) {
    console.warn('⚠️  Warning: Queue might be processing concurrently!');
  }
});

// 4. OBSERVE (in production)
// Check logs to see real queue behavior

// 5. DOCUMENT
// ✅ Queue processes requests sequentially
// ✅ Tested with 3 concurrent adds
// ✅ Duration: ~300ms (100ms × 3 requests)
// ✅ No race conditions observed
```

---

## 3. Defensive Programming

**Principle**: Assume things will break. Plan for it.

### Guard Rails

Every input should have protections:

```javascript
// ❌ Dangerous
async function generateSpeech(text) {
  return await api.tts(text); // What if text is 1MB? What if it's null?
}

// ✅ Safe
async function generateSpeech(text) {
  // Validate input exists
  if (!text) {
    throw new Error('text parameter is required');
  }

  // Protect against excessive usage
  if (text.length > 4096) {
    throw new Error(
      `Text too long (${text.length} characters). Maximum: 4096 characters. ` +
      `For longer content, split into multiple requests.`
    );
  }

  // Sanitize if needed
  text = text.trim();

  // Now it's safe to proceed
  return await api.tts(text);
}
```

### Error Handling

Never fail silently:

```javascript
// ❌ Silent failure
async function processRequest(data) {
  try {
    await doSomething(data);
  } catch (error) {
    // Oops, user has no idea this failed
  }
}

// ✅ Visible failure
async function processRequest(data) {
  try {
    const result = await doSomething(data);
    console.log('✅ Request processed successfully');
    return result;
  } catch (error) {
    console.error('❌ Request failed:', error.message);

    // Log for debugging
    await logError({
      operation: 'processRequest',
      error: error.message,
      data: data,
      timestamp: new Date().toISOString()
    });

    // Re-throw or return error response
    throw error;
  }
}
```

---

## 4. Observability First

**If you can't see it, you can't debug it.**

### Build in Visibility from Day 1

```javascript
// ❌ Black box
async function processPayment(amount) {
  const result = await stripe.charge(amount);
  return result;
}

// ✅ Observable
async function processPayment(amount) {
  const startTime = Date.now();

  console.log(`💳 Processing payment: $${amount}`);

  try {
    const result = await stripe.charge(amount);
    const duration = Date.now() - startTime;

    console.log(`✅ Payment successful: $${amount} in ${duration}ms`);

    // Log for analytics
    await logPayment({
      amount: amount,
      success: true,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`❌ Payment failed: $${amount} - ${error.message}`);

    await logPayment({
      amount: amount,
      success: false,
      error: error.message,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });

    throw error;
  }
}
```

### What to Log

**Always log**:
- ✅ Success/failure
- ✅ Duration/timing
- ✅ Key parameters
- ✅ Cost estimates (if applicable)
- ✅ Errors with context

**Never log**:
- ❌ Passwords
- ❌ API keys
- ❌ Personal data (unless encrypted)
- ❌ Credit card numbers

---

## 5. Evidence-Based Development

**Don't say "it works" - prove it works.**

### ❌ Unverified Claims
```javascript
// "I added caching, it should be faster now"
const cache = new Map();

function getUser(id) {
  if (cache.has(id)) return cache.get(id);
  const user = db.getUser(id);
  cache.set(id, user);
  return user;
}
```

**Question**: How much faster? Does it work? Is the cache being used?

### ✅ Verified Implementation
```javascript
const cache = new Map();
let cacheHits = 0;
let cacheMisses = 0;

function getUser(id) {
  const startTime = Date.now();

  if (cache.has(id)) {
    cacheHits++;
    const user = cache.get(id);
    const duration = Date.now() - startTime;
    console.log(`✅ Cache HIT for user ${id} (${duration}ms)`);
    return user;
  }

  cacheMisses++;
  const user = db.getUser(id);
  cache.set(id, user);
  const duration = Date.now() - startTime;
  console.log(`⚠️  Cache MISS for user ${id} (${duration}ms)`);

  return user;
}

// Prove it works
function getCacheStats() {
  const total = cacheHits + cacheMisses;
  const hitRate = total > 0 ? (cacheHits / total * 100).toFixed(1) : 0;
  return {
    hits: cacheHits,
    misses: cacheMisses,
    hit_rate: `${hitRate}%`,
    total_requests: total
  };
}

// Test it
console.log('\n🧪 Testing cache...');
getUser(1); // Miss
getUser(1); // Hit
getUser(2); // Miss
getUser(1); // Hit
console.log('📊 Cache stats:', getCacheStats());
// Output: { hits: 2, misses: 2, hit_rate: '50.0%', total_requests: 4 }
```

**Now you have proof**:
- Cache is working (50% hit rate)
- Performance improvement visible (timing logs)
- Easy to debug (can see misses)

---

## 6. Test Before You Ship

**Write tests that prove your code works, not tests that pass.**

### Meaningful Tests

```javascript
// ❌ Useless test
test('function exists', () => {
  expect(typeof processPayment).toBe('function');
  // Cool, it exists. But does it work?
});

// ✅ Useful test
test('processes payment successfully', async () => {
  const amount = 10.00;
  const result = await processPayment(amount);

  expect(result.success).toBe(true);
  expect(result.amount).toBe(amount);
  expect(result.transaction_id).toBeDefined();

  // Verify side effects
  const log = await getLatestPaymentLog();
  expect(log.amount).toBe(amount);
  expect(log.success).toBe(true);
});

test('rejects negative amounts', async () => {
  await expect(processPayment(-10)).rejects.toThrow('Amount must be positive');
});

test('handles API failures gracefully', async () => {
  // Mock API failure
  stripe.charge = jest.fn().mockRejectedValue(new Error('Network error'));

  await expect(processPayment(10)).rejects.toThrow('Network error');

  // Verify error was logged
  const log = await getLatestPaymentLog();
  expect(log.success).toBe(false);
  expect(log.error).toBe('Network error');
});
```

### Test Edge Cases

```javascript
// Test the happy path
test('normal case: 100 character message', async () => {
  const text = 'a'.repeat(100);
  const result = await generateSpeech(text);
  expect(result.success).toBe(true);
});

// Test the boundaries
test('boundary: exactly 4096 characters', async () => {
  const text = 'a'.repeat(4096);
  const result = await generateSpeech(text);
  expect(result.success).toBe(true);
});

test('boundary: 4097 characters (should fail)', async () => {
  const text = 'a'.repeat(4097);
  await expect(generateSpeech(text)).rejects.toThrow('Text too long');
});

// Test edge cases
test('edge case: empty string', async () => {
  await expect(generateSpeech('')).rejects.toThrow('text parameter is required');
});

test('edge case: special characters', async () => {
  const text = 'Hello! How are you? 你好';
  const result = await generateSpeech(text);
  expect(result.success).toBe(true);
});
```

---

## 7. Incremental Complexity

**Start simple. Prove it works. Add complexity.**

### ❌ Big Bang Approach
```javascript
// Try to build everything at once
class AdvancedTTSSystem {
  constructor() {
    this.queue = new RequestQueue();
    this.cache = new Map();
    this.rateLimiter = new RateLimiter();
    this.logger = new Logger();
    this.metrics = new MetricsCollector();
    this.failover = new FailoverHandler();
  }

  async generate(text, options) {
    // 500 lines of code
    // Something's broken but where???
  }
}
```

### ✅ Incremental Approach

**Step 1: Basic functionality**
```javascript
class SimpleTTS {
  async generate(text) {
    return await api.tts(text);
  }
}

// Test it
const tts = new SimpleTTS();
const result = await tts.generate('Hello');
console.log('✅ Basic TTS works');
```

**Step 2: Add safety**
```javascript
class SimpleTTS {
  async generate(text) {
    if (!text) throw new Error('text required');
    if (text.length > 4096) throw new Error('text too long');
    return await api.tts(text);
  }
}

// Test the guards
await expectError(tts.generate(''));
await expectError(tts.generate('a'.repeat(5000)));
console.log('✅ Guards work');
```

**Step 3: Add queueing**
```javascript
class SimpleTTS {
  constructor() {
    this.queue = new RequestQueue();
  }

  async generate(text) {
    if (!text) throw new Error('text required');
    if (text.length > 4096) throw new Error('text too long');

    return await this.queue.add(() => api.tts(text));
  }
}

// Test concurrent access
Promise.all([
  tts.generate('one'),
  tts.generate('two'),
  tts.generate('three')
]);
console.log('✅ Queue works');
```

**Step 4: Add logging**
```javascript
class SimpleTTS {
  constructor() {
    this.queue = new RequestQueue();
  }

  async generate(text) {
    if (!text) throw new Error('text required');
    if (text.length > 4096) throw new Error('text too long');

    const startTime = Date.now();
    const result = await this.queue.add(() => api.tts(text));
    const duration = Date.now() - startTime;

    await logUsage({
      chars: text.length,
      duration_ms: duration,
      success: true
    });

    return result;
  }
}

// Verify logs are written
console.log('✅ Logging works');
```

**Each step is tested and verified before moving forward.**

---

## 8. Documentation as Proof

Documentation should **prove** the code works, not just describe it.

### ❌ Speculative Documentation
```markdown
## Features
- Fast caching system
- Handles high load
- Optimized performance
```

**Questions**: How fast? What load? Proof?

### ✅ Evidence-Based Documentation
```markdown
## Features

### Caching System
- **Hit Rate**: 73% (based on 10,000 production requests)
- **Performance**: Cache hits: ~2ms, Cache misses: ~45ms (22.5x faster)
- **Memory Usage**: ~15MB for 10,000 cached items

**Test Results**:
```bash
🧪 Testing cache...
✅ Cache HIT for user 1 (2ms)
✅ Cache HIT for user 1 (1ms)
⚠️  Cache MISS for user 2 (47ms)
📊 Hit rate: 66.7% (2/3 requests)
```

**Production Metrics** (7 days):
- Total requests: 247,891
- Cache hits: 180,960 (73%)
- Cache misses: 66,931 (27%)
- Average response time: 12ms
```

**Now readers can**:
- Trust the claims (backed by data)
- Understand real performance
- Debug issues (clear metrics)
- Make informed decisions

---

## 9. Professional Communication

### Console Output Standards

```javascript
// ❌ Unhelpful
console.log('doing thing');
console.log('done');

// ✅ Professional
console.log('🎤 Generating speech (queue: 0): "Hello world!"');
console.log('✅ [openai] 120 chars | $0.001800 | nova | 2451ms');
console.log('✅ Audio generated: /path/to/audio-1234567890.mp3');
```

### Use Meaningful Icons
- ✅ Success
- ❌ Error
- ⚠️  Warning
- 🧪 Testing
- 📊 Statistics
- 🎤 Processing
- 📁 File operation
- 💰 Cost-related

### Error Messages

```javascript
// ❌ Cryptic
throw new Error('Invalid input');

// ✅ Actionable
throw new Error(
  `Text too long (${text.length} characters). Maximum: 4096 characters. ` +
  `For longer content, split into multiple requests.`
);
```

---

## 10. Code Review Mindset

**Review your own code like you're reviewing a junior developer's PR.**

### Questions to Ask

Before committing:
- ✅ Does this feature actually work? (Did I test it?)
- ✅ What happens if it fails? (Error handling?)
- ✅ Can I debug this in 6 months? (Logging?)
- ✅ What breaks if inputs are weird? (Edge cases?)
- ✅ How do I know this is fast/slow? (Metrics?)
- ✅ Is this the simplest approach? (Complexity?)

### Red Flags

```javascript
// 🚩 No error handling
const result = await api.call();

// 🚩 No validation
function process(data) {
  return data.value * 2;
}

// 🚩 No logging
async function criticalOperation() {
  await doImportantThing();
}

// 🚩 Magic numbers
if (value > 4096) { /* why 4096? */ }

// 🚩 Silent failure
try {
  await thing();
} catch (e) {
  // do nothing
}
```

---

## 11. Production Mindset

**Write code that you'd be comfortable debugging at 3am.**

### What Makes Code "Production Ready"?

```javascript
// ❌ Not production ready
async function sendEmail(to, subject, body) {
  await emailService.send(to, subject, body);
}

// ✅ Production ready
async function sendEmail(to, subject, body) {
  // Validation
  if (!to || !subject || !body) {
    throw new Error('Missing required parameters');
  }

  // Logging (for debugging)
  console.log(`📧 Sending email to: ${to.substring(0, 20)}...`);
  const startTime = Date.now();

  try {
    // Rate limiting (protect external API)
    await rateLimiter.waitForSlot();

    // Actual operation
    const result = await emailService.send(to, subject, body);

    // Success metrics
    const duration = Date.now() - startTime;
    console.log(`✅ Email sent successfully (${duration}ms)`);

    // Analytics
    await logEmail({
      to: to,
      subject: subject,
      success: true,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });

    return result;

  } catch (error) {
    // Error visibility
    const duration = Date.now() - startTime;
    console.error(`❌ Email failed: ${error.message}`);

    // Error logging (for debugging at 3am)
    await logEmail({
      to: to,
      subject: subject,
      success: false,
      error: error.message,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });

    // Re-throw for caller to handle
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
```

**Now when it breaks at 3am**:
- You know which email failed (logging)
- You know when it failed (timestamp)
- You know why it failed (error message)
- You can see the pattern (analytics)

---

## 12. When to Break These Rules

**These principles are guidelines, not laws.**

### It's OK to skip if:

1. **Prototyping**: Exploring an idea, will throw away
2. **Trivial code**: 3-line utility function
3. **Time-critical**: Production is down, fix first, refactor later
4. **Legacy constraints**: Working with existing terrible codebase

### It's NOT OK to skip if:

1. **Production code**: Users depend on it
2. **Team code**: Others will maintain it
3. **Complex logic**: Hard to understand without tests
4. **Financial impact**: Costs money if broken
5. **Security critical**: Handles passwords, payments, etc.

---

## Real-World Example

### Scenario: Add TTS to Telegram Bot

**❌ Cowboy Coding**:
```javascript
// Just ship it
app.post('/tts', async (req, res) => {
  const audio = await openai.tts(req.body.text);
  res.send(audio);
});
```

**Problems**:
- No validation
- No error handling
- No rate limiting
- No logging
- No idea if it works
- No idea what it costs

**✅ Professional Implementation**:

```javascript
// 1. BUILD with safety
app.post('/tts', async (req, res) => {
  try {
    // Validation
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }
    if (text.length > 4096) {
      return res.status(400).json({
        error: `Text too long (${text.length} chars). Max: 4096 chars.`
      });
    }

    // Logging
    console.log(`🎤 TTS request: ${text.substring(0, 50)}...`);
    const startTime = Date.now();

    // Rate limiting
    await rateLimiter.checkLimit(req.ip);

    // Queue (prevents concurrent API calls)
    const audio = await ttsQueue.add(() => openai.tts(text));

    // Metrics
    const duration = Date.now() - startTime;
    console.log(`✅ TTS generated in ${duration}ms`);

    // Analytics
    await logTTS({
      text_length: text.length,
      cost: calculateCost(text.length),
      duration_ms: duration,
      success: true,
      ip: req.ip
    });

    res.json({ success: true, audio });

  } catch (error) {
    console.error(`❌ TTS failed: ${error.message}`);

    await logTTS({
      text_length: req.body.text?.length || 0,
      success: false,
      error: error.message,
      ip: req.ip
    });

    res.status(500).json({ error: error.message });
  }
});

// 2. TEST it
const testCases = [
  { text: 'Hello', shouldPass: true },
  { text: '', shouldPass: false },
  { text: 'a'.repeat(5000), shouldPass: false },
];

for (const test of testCases) {
  const res = await fetch('/tts', {
    method: 'POST',
    body: JSON.stringify(test)
  });
  const passed = (res.ok === test.shouldPass);
  console.log(`${passed ? '✅' : '❌'} Test: ${test.text.substring(0, 20)}`);
}

// 3. VERIFY in production
// Check logs/tts-2025-10-30.jsonl
// Total requests: 19
// Success rate: 100%
// Average cost: $0.0017
```

**Results**:
- ✅ 19 requests processed
- ✅ 100% success rate
- ✅ Full audit trail
- ✅ Cost tracking
- ✅ Easy debugging

---

## Summary: The Engineering Mindset

### Traditional Developer
"I wrote the code, it should work."

### Professional Engineer
"I wrote the code, tested it, verified it works, and have proof."

---

### The Three Questions

Before shipping any code, ask:

1. **Does it work?**
   - Did you test it?
   - What's your proof?

2. **How do you know it works?**
   - What metrics do you have?
   - Can you see it working?

3. **What happens when it breaks?**
   - Can you debug it?
   - Will you know it broke?
   - Can you recover?

If you can't answer these confidently, **don't ship it yet**.

---

## Practical Checklist

Before marking a feature "done":

- [ ] Feature implemented
- [ ] Feature tested (with proof)
- [ ] Edge cases handled
- [ ] Errors logged
- [ ] Success/failure visible
- [ ] Performance measured
- [ ] Documentation updated with evidence
- [ ] Code reviewed (even if just by you)
- [ ] Verified in production (if applicable)

---

## Final Thought

> **"Weeks of debugging can save you hours of planning."**

The extra 20% effort upfront (testing, logging, validation) saves 300% effort later (debugging production issues at 3am).

**Professional engineers build systems that are:**
- Testable (can verify they work)
- Observable (can see them working)
- Debuggable (can fix them when broken)
- Maintainable (can understand them later)

**This isn't perfectionism - it's professionalism.**

---

## 13. Task Management & Documentation

### Task File Organization

All task documentation should be organized in the `tasks/` directory:

```
tasks/
├── TODO-feature-name-YYYY-MM-DD-HHMM.md      # Active tasks
├── TODO-another-feature-YYYY-MM-DD-HHMM.md
└── completed/                                  # Completed tasks
    ├── TODO-old-feature-YYYY-MM-DD-HHMM.md
    └── TODO-another-YYYY-MM-DD-HHMM.md
```

### Creating Task Files

**Format**: `TODO-{feature-name}-{YYYY-MM-DD}-{HHMM}.md`

**Example**: `TODO-image-generation-2025-10-30-1430.md`

```markdown
# Image Generation Feature

**Created**: 2025-10-30 14:30
**Status**: In Progress

## Goal
Add image generation capability to Telegram bots using DALL-E.

## Requirements
- [ ] Implement 2-turn flow for image generation
- [ ] Add image file organization
- [ ] Add status indicator "Drawing..."
- [ ] Test with multiple bots

## Progress
- [x] Created sendToClaudeWithImage function
- [x] Added filename pre-generation
- [x] Implemented file finding and organization
- [ ] Testing in production

## Notes
- Following same pattern as TTS implementation
- Using dall-e-2 for testing (cheaper)
```

### When to Create Task Files

**DO create a task file for**:
- Features requiring multiple steps
- Work spanning multiple sessions
- Complex implementations needing tracking
- Features requiring testing/validation

**DON'T create a task file for**:
- One-line fixes
- Trivial updates
- Quick documentation changes
- Immediate completions

### Moving Completed Tasks

When a task is **100% complete**, move it to `tasks/completed/`:

```bash
mv tasks/TODO-feature-name-2025-10-30-1430.md tasks/completed/
```

**Completion criteria**:
- ✅ All requirements implemented
- ✅ Tested and verified working
- ✅ Documented
- ✅ No outstanding issues

### Benefits

1. **Chronological tracking**: Timestamp shows when work started
2. **Clear organization**: Active vs completed tasks separated
3. **Historical record**: Can review past implementations
4. **Context preservation**: Full details available for future reference
5. **Progress visibility**: Easy to see what's in flight vs done

---

## 14. Session Notes & Analysis Documentation

### Session Notes Organization

All analysis documents and deep-dive notes created during development sessions should be organized in timestamped folders:

```
session-notes/
├── 2025-11-01/                                    # Today's session
│   ├── VPS-DEPLOYMENT-ANALYSIS.md
│   ├── SCALING-ANALYSIS.md
│   ├── ARCHITECTURE-COMPARISON.md
│   ├── REAL-ECONOMICS.md
│   ├── MARKET-REALITY-CHECK.md
│   └── PARODY-BOT-STRATEGY.md
├── 2025-10-30/                                    # Previous session
│   └── INITIAL-ARCHITECTURE-NOTES.md
└── 2025-10-29/
    └── PLANNING-SESSION.md
```

### When to Create Session Notes

**Create session notes for**:
- Architecture analysis and comparisons
- Scaling/performance deep-dives
- Market research and strategy documents
- Economic/cost analysis
- Legal/compliance research
- Long-form planning documents
- Strategic decision documentation

**Format**: Descriptive filename in UPPERCASE with hyphens
**Example**: `SCALING-ANALYSIS.md`, `VPS-DEPLOYMENT-GUIDE.md`

### Organizing Session Notes

**At the end of each session:**

1. Create date folder if it doesn't exist:
   ```bash
   mkdir -p session-notes/$(date +%Y-%m-%d)
   ```

2. Move all session markdown files:
   ```bash
   mv *.md session-notes/$(date +%Y-%m-%d)/
   ```

3. Keep core docs in root:
   - README.md
   - ENGINEERING-PRINCIPLES.md
   - PROJECT-OUTLINE.md
   - Setup/deployment guides actively being used

### Benefits

1. **Historical context**: See what was analyzed and when
2. **Clean root directory**: Core docs stay visible, analysis is organized
3. **Chronological discovery**: Find decisions made on specific dates
4. **Session continuity**: Pick up where you left off by reading previous session notes
5. **Knowledge preservation**: Deep analysis isn't lost in clutter

### Example Session Flow

```bash
# During session: Create analysis docs
# VPS-DEPLOYMENT-ANALYSIS.md created
# SCALING-ANALYSIS.md created
# MARKET-REALITY-CHECK.md created

# End of session: Organize into dated folder
mkdir -p session-notes/2025-11-01
mv VPS-DEPLOYMENT-ANALYSIS.md session-notes/2025-11-01/
mv SCALING-ANALYSIS.md session-notes/2025-11-01/
mv MARKET-REALITY-CHECK.md session-notes/2025-11-01/
```

### Core vs Session Documentation

**Keep in project root**:
- Engineering principles (this file)
- Project outlines and roadmaps
- Active setup/deployment guides
- README and getting started docs

**Move to session-notes/**:
- Analysis documents
- Strategy explorations
- Cost/scaling calculations
- Market research
- Architecture comparisons
- Decision rationale documents

---

*These principles were demonstrated in the TTS MCP Server project, which achieved 100% success rate across 19 production requests with zero errors, full observability, and complete audit trails.*
