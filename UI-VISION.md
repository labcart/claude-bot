# UI Vision & Design Notes

> What the native app should look like. Aesthetic, layout, sections.

---

## Overall Aesthetic

**Target vibe:** Professional hacker on weekends
- Clean, minimal, almost brutalist (like conductor.build)
- Dark mode friendly
- Fast, responsive
- Monospace accents mixed with clean sans-serif
- Not corporate, not playful - just **sharp and functional**

**Inspiration:**
- **conductor.build** (minimal, three-column layout, native macOS feel)
- VSCode Claude extension (chat window)
- Linear (clean task management)
- Arc browser (sidebar navigation)

**Specific observations from conductor.build:**
- Three-column layout: sidebar (workspaces/files) | center (activity/chat) | right (code diff)
- Light gray backgrounds (#f6f6f5, #ecece9)
- Subtle borders, generous whitespace
- Red/green for diff highlighting
- macOS-native window chrome
- Monospace for code, SF Pro-like for UI text

---

## Desktop App Technology

**Recommended: Tauri**
- React/Next.js for UI (what we know)
- Rust backend (lightweight, native feel)
- Cross-platform (macOS, Windows, Linux)
- Much lighter than Electron
- Better security

**Why not Electron:**
- Heavy (RAM/CPU hog)
- Less native feel

**Why not pure Swift/SwiftUI:**
- macOS only
- Steeper learning curve
- Slower to build

---

## Main Window Layout (REVISED)

**Key insight:** Main chat is just another bot session. All sessions are bot-to-bot. The UI makes one feel like "main" for UX.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  [Logo]                                                [Settings] [- □ ×]       │
├───────────────┬───────────────────────────────────┬───────────────────────────────┤
│               │                                   │                               │
│  LEFT SIDEBAR │      MAIN CHAT WINDOW             │   RIGHT SIDEBAR               │
│               │   (selected bot's session)        │                               │
│               │                                   │                               │
│  TASKS        │  🤖 Chatting with: Finn           │   BOTS                        │
│               │                                   │   • Finn      ← selected      │
│  Active       │  You: Implement auth              │   • Matty                     │
│  🔴 #234 Auth │                                   │   • Rick                      │
│  🟡 #235 UX   │  Finn: I'll build JWT...          │   • Main                      │
│  🟢 #236 Bug  │  [code block]                     │                               │
│               │                                   │   ─────────────────────       │
│  Completed    │  Finn: Done. Here's diff:         │                               │
│  ✓ #233 Test  │  + added rate limiting            │   SESSIONS                    │
│               │  - removed old auth               │   (for Finn)                  │
│───────────────│                                   │                               │
│               │  [generated image shows here]     │   Today                       │
│  TOOLS        │  [or file preview shows here]     │   • Auth work   ← current     │
│               │  [or TTS audio player here]       │   • Bug fixes                 │
│  • TTS        │                                   │                               │
│  • Image Gen  │                                   │   Yesterday                   │
│  • GitHub     │  [Type message...]                │   • Feature X                 │
│  • ...        │  [Send] [📎]                      │   • Refactor                  │
│               │                                   │                               │
└───────────────┴───────────────────────────────────┴───────────────────────────────┘
```

**Layout notes:**
- **Left sidebar (200-250px):** Tasks (primary focus) + Tools below
- **Center panel (flexible):** Chat with selected bot, multi-purpose display (chat/files/images/tool output)
- **Right sidebar (200-250px):** Bot selector + session history for that bot
- When you click "Matty" in right sidebar → center switches to Matty's chat, sessions list updates to Matty's sessions

**The fundamental architecture:**
```
ALL sessions = Claude CLI bots
Main chat = just another bot (happens to be the one user talks to most)
Finn/Matty/Rick = other bots
Bot server orchestrates communication between ALL bots (including "main")
```

---

## Left Sidebar Sections

### 1. TASKS (Primary Focus)
**Active tasks:**
- Task ID + brief description
- Status indicators:
  - 🔴 Red: Blocked or urgent
  - 🟡 Yellow: In progress
  - 🟢 Green: Ready for review
- Click to view details
- Right-click to assign to bot
- Drag-and-drop onto bot (future feature)

**Completed tasks:**
- ✓ Checkmark indicator
- Collapsed by default
- Click to expand/view details
- Maybe link to git branch/PR

**Task assignment:**
- Right-click task → "Assign to Finn"
- Or type in chat: "@finn work on #234"
- Or drag task from left onto bot name in right sidebar

### 2. TOOLS (Below Tasks)
**Available MCP tools:**
- TTS (text-to-speech)
- Image Gen (DALL-E)
- GitHub integration
- Other MCP servers

**Features:**
- Click to configure/enable
- Status indicator (enabled/disabled)
- Tool output shows in main chat window

---

## Right Sidebar Sections

### 1. BOTS (Bot Selector)
**List of bot personalities:**
- Main (default/orchestrator bot)
- Finn (Backend)
- Matty (Design/UX)
- Rick (Security/DevOps)
- [+ Add custom bot]

**Features:**
- Click bot → switches main chat window to that bot's session
- Selected bot is highlighted
- Maybe avatar icons
- Status indicator (active/idle)

### 2. SESSIONS (For Selected Bot)
**Session history for currently selected bot:**
- Grouped by date (Today, Yesterday, Last 7 days)
- Shows conversation titles/previews
- Click to load that session in main window
- Current session is highlighted
- Search/filter sessions

**Example:**
- User selects "Finn" in BOTS
- SESSIONS below shows all Finn's past conversations
- Click "Auth work" → loads that conversation in center

---

## Main Chat Window (Center Panel)

**Multi-purpose display area - shows:**
1. **Chat with selected bot** (primary use)
   - Claude-style conversation
   - Markdown rendering
   - Code blocks with syntax highlighting
2. **File previews** (when bot shares files)
   - Inline diff view (red/green highlighting)
   - Click to open in external IDE
3. **Generated images** (from Image Gen tool)
4. **Audio player** (from TTS tool)
5. **Any other tool output**

**Header:**
- 🤖 "Chatting with: [Bot Name]"
- Shows which bot you're currently talking to

**Input area:**
- Text field (multi-line, expandable)
- Send button
- Attach files button (📎)
- No "Delegate" dropdown (delegation happens via right-click task or @mention)

**Chat messages show:**
- Timestamp
- Bot avatar/name
- Message content
- Actions (copy, delete)
- For code: syntax highlighting, copy button

---

## Right-Click Context Menus

**On bot (left sidebar):**
- Open DM
- Delegate current context to...
- Configure bot
- Disable/Enable

**On message (chat window):**
- Copy
- Edit
- Delete
- Delegate to bot
- Create task from message

**On file reference:**
- Open in IDE
- Open inline
- Copy path
- Show in finder

---

## File/IDE Integration

**Like VSCode Claude extension:**
- Click file reference → opens inline preview or external IDE
- Code blocks are editable (apply changes directly)
- Diff view for changes bot wants to make
- Approve/reject changes

**File explorer (optional):**
- Could add a file tree to left sidebar
- Or keep it minimal and rely on file references in chat

---

## Settings/Config Panel

**Accessible via top-right icon**

**Sections:**
- **Bots:** Add/edit/remove bot personalities
- **Tools:** Enable/disable MCP servers, configure integrations
- **Appearance:** Dark/light mode, font size, theme
- **Git:** Configure worktrees, branch naming
- **Claude:** Login status, API usage (if using API)
- **Keyboard shortcuts**

---

## Visual Design Details

### Color Palette
**Light mode (conductor.build style):**
- Background: #f6f6f5 (warm off-white)
- Sidebar: #ecece9 (slightly darker warm gray)
- Text: #2c2826 (dark charcoal, not pure black)
- Borders: #e0e0e0 (subtle)
- Accent: Maybe #007aff (macOS blue) or keep minimal
- Success/Add: #28a745 (green for additions/positive)
- Error/Remove: #dc3545 (red for deletions/negative)

**Dark mode:**
- Background: #1e1e1e (VSCode dark)
- Sidebar: #252526 (slightly lighter)
- Text: #d4d4d4 (light gray)
- Borders: #3e3e3e (subtle)
- Accent: Same as light mode
- Success/Add: #3fb950 (GitHub green)
- Error/Remove: #f85149 (GitHub red)

### Typography
- **UI Font:** SF Pro (macOS system) or Inter (cross-platform)
- **Code Font:** SF Mono (macOS), JetBrains Mono (cross-platform), or Fira Code
- **Sizes:** 14px base text, 12px sidebar labels, 13px code blocks
- **Weights:** Regular (400) for body, Medium (500) for emphasis, Semibold (600) for headings

### Spacing
- Generous whitespace
- Consistent padding (16px, 24px)
- Clean borders (1px, subtle)

### Animations
- Smooth transitions (150ms)
- Fade in/out for messages
- Slide in/out for sidebar
- No over-the-top animations

---

## Key Interactions

### Delegating to a bot
**Option 1:** Type naturally
```
User: "Finn, implement auth"
```

**Option 2:** Dropdown in input area
- Select bot from dropdown
- Type message
- Sends to that bot

**Option 3:** Right-click on message
- "Delegate to..." → select bot
- Sends that message context to bot

### Viewing bot conversations
**Option 1:** Click bot in sidebar
- Opens DM with that bot
- See full conversation history
- Can chat directly

**Option 2:** Inline in main chat
- Bot responses appear in main chat
- Tagged with bot name/avatar
- Can expand to see full context

### Managing tasks
- Create task from message (right-click)
- Tasks auto-created when delegating?
- Mark as complete manually or auto-detect?
- Link to git branch/PR

---

## Questions to Answer

1. **Does main chat have a personality?**
   - Probably NO - just raw Claude
   - User orchestrates bots manually

2. **File explorer in sidebar?**
   - Maybe later, not MVP
   - File references in chat might be enough

3. **Git branch isolation UI?**
   - Show which branch each bot is working on?
   - Merge UI when task complete?

4. **Notifications?**
   - Native macOS notifications when bot finishes task?
   - Sound/visual indicator?

5. **Multi-window support?**
   - Pop out bot DMs into separate windows?
   - Or keep everything in one window?

---

## MVP Features (Must-Have)

- ✅ Left sidebar (Bots, Tools, Sessions, Tasks)
- ✅ Main chat window (Claude-style)
- ✅ Bot delegation (via dropdown or natural language)
- ✅ File references (click to open)
- ✅ Code blocks with syntax highlighting
- ✅ Session history
- ✅ Dark/light mode
- ✅ Settings panel

---

## Nice-to-Have (Later)

- File explorer in sidebar
- Git branch visualization
- Multi-window support
- Voice input
- Inline file editing
- Advanced task management
- Workflow builder (visual)
- Custom themes

---

## Technical Implementation Notes

### Tech Stack
- **Frontend:** React/Next.js
- **Desktop:** Tauri (Rust backend)
- **Styling:** TailwindCSS or styled-components
- **State:** Zustand or React Context
- **Real-time:** WebSocket (bot ↔ UI)
- **Database:** SQLite (local, embedded)

### File Structure
```
/conductor-app
  /src
    /components
      /Sidebar
        Bots.tsx
        Tools.tsx
        Sessions.tsx
        Tasks.tsx
      /Chat
        ChatWindow.tsx
        Message.tsx
        CodeBlock.tsx
        FileReference.tsx
      /Settings
        SettingsPanel.tsx
    /pages
      Home.tsx
    /lib
      /bot-server (existing server.js logic)
      /api (API routes for UI ↔ bot server)
  /src-tauri (Rust backend)
  /public
```

### Communication Flow
```
React UI (localhost:3000)
    ↕ WebSocket
Bot Server (localhost:3001)
    ↕
Claude CLI Sessions (Finn, Matty, Rick)
    ↕
User's Codebase (git worktrees)
```

---

## Next Steps

1. **Prototype in React** - Build basic UI without Tauri first
2. **Mock data** - Fake bot responses to test UI/UX
3. **Connect to existing bot server** - Wire up real delegation
4. **Package with Tauri** - Make it a native app
5. **Polish** - Animations, settings, themes

---

## Related Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical architecture
- [PRODUCT-THINKING.md](./PRODUCT-THINKING.md) - Market positioning
- [NOTES.md](./NOTES.md) - General ideas
