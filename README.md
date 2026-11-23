<div align="center">

# ⚡ Automate AI

### *Autonomous Multi-Agent Workflow Engine with Human-in-the-Loop Approvals*

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=22&pause=1000&color=9333EA&center=true&vCenter=true&width=620&lines=Agentic+AI+Powered+by+LangGraph;Autonomous+Gmail%2C+Calendar+%26+Instagram;Model+Context+Protocol+(MCP)+Enabled;Human-in-the-Loop+Safety+Guards;Integrated+Credit+Economy+via+Razorpay)](https://git.io/typing-svg)

<p align="center">
  <img src="https://img.shields.io/badge/LangGraph-1.7.4-8A2BE2?style=for-the-badge&logo=chainlink&logoColor=white" alt="LangGraph" />
  <img src="https://img.shields.io/badge/Model_Context_Protocol-MCP-00D26A?style=for-the-badge&logo=databricks&logoColor=white" alt="MCP" />
  <img src="https://img.shields.io/badge/Groq-Llama_3.3_&_DeepSeek-F55036?style=for-the-badge&logo=fastapi&logoColor=white" alt="Groq" />
  <img src="https://img.shields.io/badge/Google_Gemini-Vision_Cascade-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/React_19-Vite_Tailwind_v4-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Tests-56_Server_|_9_Client_Passing-success?style=for-the-badge&logo=checkmarx&logoColor=white" alt="Tests" />
</p>

</div>

---

## 📖 Overview

**Automate AI** is an enterprise-grade agentic assistant that coordinates specialized AI tools using **LangGraph** and the **Model Context Protocol (MCP)**. It bridges natural language reasoning with real-world task execution—managing Google Calendar schedules, composing and dispatching Gmail messages, publishing verified Instagram media containers, analyzing multimodal vision prompts, and managing account credits via Razorpay.

---

## 🚀 Architecture & Core Flows

### 1. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Client["🖥️ Frontend (React 19 + Vite + Redux)"]
        UI[Chat & Agent Interface]
        Pricing[Pricing & Razorpay Checkout]
        ApprovalUI[Interactive Action Approval Card]
    end

    subgraph Backend["⚙️ Express.js Backend"]
        Auth[Firebase Auth + JWT Middleware]
        Router[Chat & Agent Router]
        CreditGuard[Credit Balance Guard & Atomic Deductor]
        LangGraphAgent["🧠 LangGraph StateGraph"]
    end

    subgraph MCP["🔌 Stdio Model Context Protocol Server"]
        MCPAdapter["@langchain/mcp-adapters"]
        Tools["MCP Tools: Web Search | Gmail | Calendar | Instagram | Vision"]
    end

    subgraph External["🌐 External Services"]
        Groq["Groq Cloud API"]
        Gemini["Google Gemini Vision API"]
        GoogleOAuth["Google Workspace (Gmail & Calendar)"]
        MetaGraph["Meta Instagram Graph API"]
        Razorpay["Razorpay Payment Gateway"]
        MongoDB[("MongoDB Database & Checkpointer")]
    end

    UI -->|Auth Request| Auth
    UI -->|Chat Message| Router
    Pricing -->|Create Order / Verify| Router
    Router --> CreditGuard
    CreditGuard --> LangGraphAgent
    LangGraphAgent <-->|Tool Protocol| MCPAdapter
    MCPAdapter <--> Tools
    LangGraphAgent <--> Groq
    Tools <--> Gemini
    Tools <--> GoogleOAuth
    Tools <--> MetaGraph
    Router <--> Razorpay
    LangGraphAgent <-->|Checkpoint Sessions| MongoDB
    LangGraphAgent -.->|Interrupt for Approval| ApprovalUI
```

---

### 2. Conversational & Human-in-the-Loop Approval Flow

High-stakes tool executions (sending emails, scheduling calendar events, and publishing Instagram posts) are protected by a stateful **Human-in-the-Loop (HITL)** interruption boundary.

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Web as Web Client
    participant Controller as Chat Controller
    participant Graph as LangGraph Engine
    participant HITL as Action Approval Node
    participant MCP as MCP Tool Server
    participant Ext as Third-Party APIs

    User->>Web: "Send an email to team@company.com about tomorrow's sync"
    Web->>Controller: POST /api/chat { message }
    Controller->>Controller: Verify credit balance >= threshold
    Controller->>Graph: invoke({ messages, thread_id })
    Graph->>Graph: LLM evaluates user prompt & formulates send_email tool call
    Graph->>HITL: Intercept tool call in protected set
    HITL-->>Controller: LangGraph interrupt({ tool, args, preview })
    Controller-->>Web: Return HTTP 200 { interrupted: true, interrupt: payload }
    Web->>User: Renders interactive Approval Card in Chat

    alt User Approves
        User->>Web: Clicks "Approve"
        Web->>Controller: POST /api/chat/resume { threadId, decision: { approved: true } }
        Controller->>Graph: invoke(new Command({ resume: { approved: true } }))
        Graph->>MCP: Execute send_email tool with authenticated token
        MCP->>Ext: Dispatch email via Google Gmail API
        Ext-->>MCP: Message ID confirmation
        MCP-->>Graph: Tool result message
        Graph->>Controller: Final conversational synthesis
        Controller->>Controller: Atomically deduct credits from User balance
        Controller-->>Web: "Email sent successfully!"
    else User Rejects
        User->>Web: Clicks "Reject"
        Web->>Controller: POST /api/chat/resume { threadId, decision: { approved: false } }
        Controller->>Graph: invoke(new Command({ resume: { approved: false } }))
        Graph-->>Controller: "Action canceled by user."
        Controller-->>Web: Display cancellation state without executing external action
    end
```

---

### 3. Instagram Media Publishing Pipeline

```mermaid
flowchart LR
    Start["📸 User Uploads Image"] --> Convert["Transform to JPEG (Cloudinary f_jpg,q_auto)"]
    Convert --> HITL["User Approval Confirmation Guard"]
    HITL -->|Approved| Container["Meta Graph API: Create Media Container"]
    Container --> Poll{"Status Polling Loop"}
    Poll -->|IN_PROGRESS| Wait["Wait & Retry"]
    Wait --> Poll
    Poll -->|FINISHED| Publish["Meta Graph API: media_publish"]
    Poll -->|ERROR| Abort["Abort & Log Sanitized Error"]
    Publish --> Verified["Return Verified Instagram Media ID"]
```

---

### 4. Credit Economy & Payment Verification Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Customer
    participant Client as Pricing Page
    participant Server as Payment Controller
    participant Razorpay as Razorpay Gateway
    participant DB as MongoDB

    User->>Client: Selects Plan ("Pro" / "Team")
    Client->>Server: POST /api/payment/create { plan: "pro" }
    Server->>Razorpay: razorpay.orders.create({ amount: 29900, currency: "INR" })
    Razorpay-->>Server: Return order { id, amount, currency }
    Server->>DB: Record payment (status: "created")
    Server-->>Client: { order, plan, key_id }
    Client->>Razorpay: Open Razorpay Checkout Modal
    User->>Razorpay: Completes transaction
    Razorpay-->>Client: Checkout response { order_id, payment_id, signature }
    Client->>Server: POST /api/payment/verify
    Server->>Server: Validate HMAC-SHA256 Timing-Safe Signature
    Server->>DB: Update payment status to "paid" & atomical increment User credits ($inc)
    Server-->>Client: { success: true, credits: newBalance }
    Client->>User: Displays success toast and updates real-time credit balance
```

---

## 🛠️ Tech Stack

### Frontend (`client/`)
- **React 19** & **Vite 8**
- **Tailwind CSS v4** & **Shadcn UI**
- **Redux Toolkit** (Global state management for user profile & agent configurations)
- **React Router v7**
- **Razorpay Checkout SDK** (Embedded checkout modal)
- **Lucide React** (Vector icons)

### Backend (`server/`)
- **Node.js (v24 ESM)** & **Express.js**
- **LangChain & LangGraph** (StateGraph orchestration, MongoDB Checkpointer)
- **Model Context Protocol (MCP)** (@modelcontextprotocol/server & @langchain/mcp-adapters)
- **Groq SDK** (`openai/gpt-oss-120b`, `llama-3.3-70b-versatile`)
- **Google Generative AI** (`gemini-3.8-flash`, `gemini-3.8-pro` vision fallback cascade)
- **MongoDB & Mongoose 9** (Data models & atomic credit operations)
- **Firebase Admin SDK** (Token verification)
- **Google APIs** (Gmail v1 & Calendar v3)
- **Razorpay Node SDK** (Order creation & HMAC-SHA256 verification)
- **Crypto (AES-256-GCM)** (Secure token encryption at rest)

---

## 📂 Project Structure

```
AutomateAi/
├── client/                     # Frontend Single Page Application
│   ├── src/
│   │   ├── components/         # Reusable UI components (buttons, cards, dialogs)
│   │   ├── features/           # API interaction modules (auth, chat, payment, agent)
│   │   ├── pages/              # Primary views (HomePage, Pricing, CreateAgent)
│   │   ├── redux/              # Redux slices (userSlice, agentSlice, store)
│   │   └── api.js              # Centralized Axios client with credential handling
│   ├── tests/                  # Frontend unit test suites (Node native runner)
│   └── package.json
│
├── server/                     # Backend API & Agentic Execution Service
│   ├── src/
│   │   ├── config/             # Environment, DB, Razorpay, Firebase & OAuth configs
│   │   ├── controller/         # Request controllers (chat, auth, agent, payment)
│   │   ├── mcp/                # Stdio MCP Server & LangChain adapter integration
│   │   ├── middleware/         # Authentication & request protection middlewares
│   │   ├── model/              # Mongoose schemas (User, Agent, Payment, Integration)
│   │   ├── routers/            # Express routers (/api/chat, /api/payment, etc.)
│   │   └── utils/              # Graph workflows, image transformers, rate-limit retry
│   ├── tests/                  # Backend unit test suites
│   └── package.json
└── README.md
```

---

## 🧪 Testing Suite

Automate AI includes a comprehensive test suite built with Node.js's native test runner (`node:test` & `node:assert/strict`) requiring zero external test dependencies:

```bash
# Run server test suite (56 tests across 15 suites)
npm --prefix server test

# Run client test suite (9 tests across 2 suites)
npm --prefix client test

# Verify production frontend build
npm --prefix client run build
```

### Coverage Highlights:
- **`analyze_image.test.js`**: HTTPS scheme validation, MIME type filtering (JPEG/PNG/WebP), size boundary (<10MB), and MCP output compliance.
- **`payment.test.js`**: Razorpay plan validation, order creation, idempotent verification, and timing-safe signature checking.
- **`deduct_credits.test.js`**: Atomic balance decrements (`$inc`), negative balance prevention (`$gte`), and user presence checks.
- **`instagram.test.js`**: Cloudinary JPEG URL conversion (`f_jpg,q_auto`), access token sanitization, and container creation/polling lifecycle.
- **`auth_crypto.test.js`**: AES-256-GCM round-trip encryption, random IV verification, and tampering detection.
- **`message_sanitizer.test.js`**: Groq string content normalization, multimodal array flattening, and tool message preservation.
- **`retry.test.js`**: HTTP 429 rate-limit parsing, exponential backoff, and retry window exhaustion.

---

<div align="center">

Made with ❤️ by **Mann**

</div>
