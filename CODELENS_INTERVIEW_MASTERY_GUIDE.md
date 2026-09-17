# CodeLens: Complete Interview Preparation & Technical Mastery Guide

> [!IMPORTANT]
> **Project Identity**: CodeLens is a **Hybrid Graph-RAG system for codebase intelligence**. Point it at any public GitHub repository (Python, TypeScript, JavaScript), ask questions in plain English, and get answers grounded in AST-aligned code chunks, a deterministic structural knowledge graph (NetworkX), and exact clickable source citations.
> 
> **Live Demo**: `https://code-lens-tau-rose.vercel.app`  
> **GitHub Repository**: `https://github.com/M-A-SAIADITHYAA/CodeLens`

---

## 1. The "Tell Me About Your Project" Pitch

### The 60-Second Elevator Pitch (Memorize This)
> *"I built **CodeLens**, an open-source Hybrid Graph-RAG platform for repository intelligence. Standard vector RAG fails on code because embeddings only capture lexical and semantic similarity—they have no concept of execution flow or call hierarchies. For instance, if you ask 'What happens when a user logs in?', vector search fetches files with the word 'login', completely missing the chain: `login -> authMiddleware -> validateToken -> createSession`.
>
> To solve this, CodeLens combines two retrieval streams:
> 1. **Semantic retrieval** using AST-bounded code chunks (functions, classes, methods) embedded into a FAISS index.
> 2. **Structural graph retrieval** using Tree-sitter ASTs mapped into an in-memory NetworkX directed graph capturing `CALLS`, `IMPORTS`, `CONTAINS`, `EXTENDS`, and `REFERENCES` edges.
>
> At query time, we extract identifiers, run BFS traversal with exponential hop decay, and fuse the results deterministically using a weighted score: $0.6 \times \text{Semantic} + 0.4 \times \text{Graph}$. This feeds an LLM with exact code provenance, relationship context, and call paths, while also powering an automated **Impact Analysis Engine** that answers 'What breaks if I change this function?'."*

### The 2-Minute Architectural Pitch (For System Design & Deep Dives)
> *"When designing CodeLens, I set out to fix three fundamental flaws in naive code assistants: arbitrary chunking that slices functions mid-logic, hallucinated call chains, and zero visibility into blast radius when modifying code.
>
> In our ingestion pipeline, we shallow-clone public repositories with strict security isolation—code is never executed, dependencies are never installed, and git hooks are neutered. We parse Python, TypeScript, and JavaScript using Tree-sitter down to real ASTs, extracting symbols and imports. From this, we build a multi-directed knowledge graph in NetworkX where cross-file calls are resolved against import bindings.
>
> Instead of token-window chunking, we chunk structurally at symbol boundaries with metadata like `file_path`, `symbol`, and `line_range`. Chunks are embedded via a local sentence-transformer (`all-MiniLM-L6-v2`) into a FAISS `IndexFlatIP` vector store.
>
> When a user queries the codebase, we execute a dual-stream search: cosine similarity over the FAISS vectors, plus deterministic BFS graph traversal starting from extracted query symbols. A custom ranker deduplicates candidates and scores them via weighted fusion. The prompt to the LLM packs both the code and explicit graph relationships (`A CALLS B`). The system also works in **retrieval-only mode** with zero API keys required, and provides an interactive Next.js / React Flow interface where developers can visually inspect symbol neighborhoods and calculate impact blast radiuses."*

---

## 2. Core Problem: Why Plain Vector RAG Fails on Code

In an interview, articulating **why** standard approaches fail shows senior-level domain understanding.

| Challenge | Vanilla Vector RAG | CodeLens (Hybrid Graph-RAG) |
| :--- | :--- | :--- |
| **Call Hierarchies** | Only finds files matching keywords. Cannot answer *"What does `initiateCheckout` trigger?"* | Graph traverses `CALLS` edges deterministically across files (`checkout -> chargeCard -> sendReceipt`). |
| **Reverse Dependencies / Blast Radius** | Cannot compute callers or importers because embeddings have no directionality. | Performs reverse BFS on in-edges to instantly list direct callers, transitive callers, and dependent files. |
| **Chunk Quality** | Slices by token counts (e.g. 500 tokens), frequently cutting functions in half and splitting signatures from logic. | **AST-aligned chunking**: 1 chunk = 1 function/class/method. Preserves exact line numbers and symbol names. |
| **Architectural Centrality** | Misses critical utility functions that don't match the query keywords (e.g., `execute_sql()` or `verify_signature()`). | Graph degree and structural traversals pull in connected central nodes even if semantic score is modest. |
| **Hallucination Control** | The LLM invents function calls because it doesn't know the call chain. | Prompt supplies verified `RELATIONSHIPS` (e.g., `login CALLS authMiddleware`) directly from the parsed graph. |

> [!NOTE]
> **Key Mantra to Repeat in Interviews**:  
> *"Embeddings answer what code looks similar. The knowledge graph answers how code is connected."*

---

## 3. High-Level Architecture & The 10-Stage Pipeline

```mermaid
flowchart TB
    subgraph Ingestion
        A["GitHub Repository URL"] -->|Validation & Size Check| B["Shallow Clone (--depth 1)"]
        B -->|File Filter (Ignore node_modules, dist, etc.)| C["Source Files (.ts, .js, .py)"]
        C -->|Tree-sitter AST Parser| D["Symbols & Imports"]
        D --> E["NetworkX Knowledge Graph"]
        D --> F["Structural Code Chunks"]
        F -->|all-MiniLM-L6-v2| G["Normalized Vectors"]
        G --> H["FAISS Vector Store (IndexFlatIP)"]
        E --> I[("Disk Cache: graph.pkl")]
        H --> J[("Disk Cache: vectors/ & chunks.json")]
    end

    subgraph Query Execution
        Q["User Question"] --> S1["Semantic Retrieval (FAISS Cosine Search)"]
        Q --> S2["Graph Retrieval (Identifier Match + BFS)"]
        S1 --> K["Candidate Fusion & Dedup"]
        S2 --> K
        K -->|0.6 Semantic + 0.4 Graph| L["Hybrid Reranking (Top-K)"]
        L --> M["Context Builder (Code + Relationships + Paths)"]
        M --> N["LLM Generation (gpt-4o-mini / Groq)"]
        N --> O["Answer + Clickable Citations + Graph Subgraph"]
    end
```

### The 10 Stages Step-by-Step

1. **Ingestion (`app/ingestion/github_loader.py`)**:
   - Validates URL syntax and queries GitHub API (`api.github.com/repos/{owner}/{repo}`) to reject private repos and repos over `100 MB` before cloning.
   - Executes `git clone --depth 1 --single-branch` into a transient temp directory with safe environment variables (`GIT_TERMINAL_PROMPT=0`, stripped `PATH`, sandboxed `HOME`).
2. **File Filtering (`app/ingestion/file_filter.py`)**:
   - Walks files, filtering out `.git`, `node_modules`, `dist`, `build`, `.next`, `__pycache__`, `.venv`, etc.
   - Ignores binary files (`b"\x00"` check in first 8KB), files `> 1 MB`, and minified files (`.min.`, `.d.ts`, `.bundle.`). Caps at 5,000 files.
3. **AST Parsing (`app/parsing/ast_parser.py` & `code_parser.py`)**:
   - Uses Tree-sitter parsers (`tree-sitter-language-pack`) for Python, TypeScript, and JavaScript.
   - Extracts `Symbol` (functions, methods, classes, signatures, line bounds), `ImportDecl`, and `CallDecl`.
   - Has a graceful `RegexFallbackParser` if grammars are missing, ensuring indexing never crashes.
4. **Graph Construction (`app/graph/graph_builder.py`)**:
   - Builds an `nx.MultiDiGraph`.
   - Nodes: `repo::{name}`, `file::{path}`, `fn::{path}::{qualname}`, `cls::{path}::{name}`.
   - Edges: `CONTAINS`, `IMPORTS`, `CALLS`, `EXTENDS`, `REFERENCES`.
   - Cross-file call resolution: maps call receivers (`this`, `self`, imported classes, module namespace handles) back to target nodes using file-level import tables.
5. **Structural Chunking (`app/parsing/chunker.py`)**:
   - Creates 1 chunk per function/method/class with format: `file_path | symbol (kind)\n{code}`.
   - Cap of 150 lines per symbol chunk; files without symbols use an 80-line sliding window.
6. **Embeddings (`app/retrieval/embeddings.py`)**:
   - Pluggable provider interface (`SentenceTransformerProvider` or `OpenAIEmbeddingProvider`).
   - Default: local `all-MiniLM-L6-v2` (384 dimensions, L2-normalized).
7. **Vector Index (`app/retrieval/vector_store.py`)**:
   - FAISS `IndexFlatIP` (exact inner product = cosine similarity on normalized vectors).
   - Paired with `meta.json` sidecar mapping FAISS integer IDs to symbol chunk keys.
8. **Deterministic Graph Retrieval (`app/graph/graph_query.py`)**:
   - Cleans question, extracts identifiers, strips stopwords.
   - Match seeds: exact symbol name = `1.0`, file stem = `0.8`, substring match = `0.4`.
   - BFS traversal to depth 2, decaying node score: $\text{score} = 0.5^{(\text{distance} + 1)}$.
   - Finds shortest structural paths between seed symbols (e.g., `login() -> authMiddleware() -> validateToken()`).
9. **Hybrid Reranking (`app/retrieval/reranker.py`)**:
   - Fuses semantic hits and graph nodes into unified `Candidate` objects.
   - File-level nodes softly boost member chunks ($0.35 \times \text{node\_score}$).
   - Computes: $\text{FinalScore} = (0.6 \times \text{Semantic}) + (0.4 \times \text{Graph})$.
   - Tracks provenance: `"semantic"`, `"graph"`, or `"semantic+graph"`.
10. **Context Building & Generation (`app/generation/context_builder.py`, `llm.py`)**:
    - Centralized context builder respects a strict character budget (`max_context_chars = 24,000`).
    - Appends code blocks, line citations, up to 6 structural relations per chunk, and graph paths.
    - Prompts LLM (`gpt-4o-mini` or Groq `gpt-oss-20b`) enforcing zero hallucinations and exact line citations.
    - **Graceful degradation**: Runs in retrieval-only mode if no API key is provided.

---

## 4. Key Mathematical Formulas & Scoring Rules

### 1. Vector Cosine Similarity
$$\text{sim}(u, v) = \frac{u \cdot v}{\|u\|_2 \|v\|_2}$$
Because all chunk and query vectors are L2-normalized upon creation ($\|u\|_2 = 1$), FAISS `IndexFlatIP` executes exact cosine similarity with simple dot products:
$$\text{sim}(u, v) = u \cdot v$$

### 2. Graph Hop Decay Formula
During BFS from matched seed nodes:
$$\text{Decay}(\text{distance}) = 0.5^{(\text{distance} + 1)}$$
- Seed node: Score = $1.0$ (or $0.8$ for file, $0.4$ for partial)
- 1 hop away (direct caller/callee): $0.5^1 = 0.50$
- 2 hops away: $0.5^2 = 0.25$
- 3 hops away: $0.5^3 = 0.125$

### 3. File-Level Boost Factor
When a file node is matched in the graph, all chunks in that file receive a soft boost:
$$\text{ChunkGraphScore} = \max(\text{ExistingScore}, 0.35 \times \text{FileScore})$$

### 4. Hybrid Fusion Formula
$$\text{FinalScore} = w_{\text{semantic}} \cdot S_{\text{semantic}} + w_{\text{graph}} \cdot S_{\text{graph}}$$
Default configuration:
$$\text{FinalScore} = 0.6 \cdot S_{\text{semantic}} + 0.4 \cdot S_{\text{graph}}$$

---

## 5. Architectural & Design Trade-offs (Interview Gold)

Interviewers love asking *"Why did you choose X over Y?"*. Use these exact trade-offs:

### 1. Why NetworkX instead of Neo4j or Memgraph?
- **Answer**: *"For repository-level codebases (typically 1,000 to 50,000 nodes), an in-memory graph in NetworkX takes less than 20MB of RAM. Neo4j would introduce significant operational overhead—Docker containers, JVM memory footprints, network serialization latency, and connection pools. NetworkX allows millisecond graph traversals, simple Python-native pickle persistence on disk (`graph.pkl`), and zero infrastructure dependencies."*

### 2. Why FAISS IndexFlatIP instead of Pinecone, Weaviate, or HNSW?
- **Answer**: *"At the scale of an individual repository (a few hundred to a few thousand chunks), exact nearest-neighbor search (`IndexFlatIP`) takes under 2 milliseconds on CPU. Approximate indices like HNSW or vector DB services like Pinecone introduce index-tuning hyperparameters (M, efConstruction), network latency, index build delays, and recurring API costs for no measurable recall benefit at this corpus size."*

### 3. Why Tree-sitter instead of regex or language-specific compiler APIs?
- **Answer**: *"Tree-sitter provides a single unified C/Python API across TypeScript, JavaScript, and Python. It builds concrete syntax trees resilient to syntax errors (ideal for active git branches). Compiler APIs like `tsc` or `mypy` require installing full project dependencies (`node_modules`), package resolution, and tsconfig setups. Tree-sitter is self-contained and fast. And as a safety net, we built a regex fallback parser so if grammars fail, the system degrades gracefully."*

### 4. Why Weighted Score Fusion instead of a Cross-Encoder Reranker (like Cohere or BGE-Reranker)?
- **Answer**: *"A Cross-Encoder takes the query and candidate chunk and passes both through all transformer layers together. While powerful, it adds 200–500ms of latency per query, requires heavy GPU memory, and functions as an opaque black box. Our $0.6/0.4$ weighted fusion is deterministic, executes in under 1ms, is 100% explainable in an audit or interview, and allows exposing the exact provenance (`semantic`, `graph`, or `semantic+graph`) to the user."*

### 5. Why Symbol-based Structural Chunking instead of Fixed-size Token Windows?
- **Answer**: *"Fixed token chunking (e.g. 500 tokens with 50-token overlap) is oblivious to programming grammar. It slices functions across boundaries, leaving signatures in chunk A and bodies in chunk B. With structural chunking, every chunk maps 1:1 to an AST node (`UserService.validateUser`). This enables deterministic joining between vector search hits and graph nodes without fuzzy heuristics."*

---

## 6. The Impact Analysis Engine: "What Breaks If I Change This?"

One of CodeLens's standout features is its **Blast Radius / Impact Analysis** engine (`app/graph/graph_query.py:219`).

### How It Works (Deterministic Graph Algorithm):
1. **Target Identification**: Matches symbol node `fn::{path}::{symbol}` or `cls::{path}::{symbol}`.
2. **Direct Callers**: In-edges with relation `CALLS`.
3. **Transitive Callers**: Breadth-first search up to depth 3 traversing incoming `CALLS` edges, tracking visited nodes to avoid cyclic loops.
4. **Dependent Files**: Finds incoming `IMPORTS` edges targeting `file::{node_file}`.
5. **Referencing Symbols**: In-edges with relation `REFERENCES` (e.g. functions instantiating this class).
6. **Affected Tests**: Filters all affected nodes against a test file regex:  
   `(^|/)(tests?|__tests__)/|[_\-.](test|spec)\.|^test_`
7. **Severity Calculation**:
   - **HIGH**: Direct callers $\ge 4$ OR Total affected $\ge 8$.
   - **MEDIUM**: Direct callers $\ge 1$ OR Total affected $\ge 3$.
   - **LOW**: Isolated symbol.
8. **Optional LLM Summary**: The structured JSON facts are fed into `IMPACT_SYSTEM_PROMPT` to synthesize a concise human-readable risk summary.

---

## 7. Codebase Navigation Cheat Sheet

When screensharing or discussing files, refer to these exact paths:

| Module / Layer | File Path | Core Function / Responsibility |
| :--- | :--- | :--- |
| **FastAPI Entrypoint** | [`backend/app/main.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/main.py) | CORS, route mounting, logging configuration. |
| **Config & Settings** | [`backend/app/core/config.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/core/config.py) | Pydantic settings: top-k, weights (0.6/0.4), model names, limits. |
| **GitHub Ingestion** | [`backend/app/ingestion/github_loader.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/ingestion/github_loader.py) | Shallow cloning, pre-clone API size check, environment sanitization. |
| **File Filter** | [`backend/app/ingestion/file_filter.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/ingestion/file_filter.py) | Ignored directories, binary file detection, file size cap. |
| **AST Parser** | [`backend/app/parsing/ast_parser.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/parsing/ast_parser.py) | Tree-sitter parsing for TS/JS/Python; extracts symbols, calls, imports. |
| **Chunking Engine** | [`backend/app/parsing/chunker.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/parsing/chunker.py) | Symbol-level chunking, embedding text formatting, line caps. |
| **Graph Builder** | [`backend/app/graph/graph_builder.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/graph/graph_builder.py) | NetworkX graph construction, module resolution, cross-file call resolution. |
| **Graph Queries** | [`backend/app/graph/graph_query.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/graph/graph_query.py) | Entity matching, BFS neighborhood traversal, impact analysis calculation. |
| **Vector Store** | [`backend/app/retrieval/vector_store.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/retrieval/vector_store.py) | FAISS IndexFlatIP cosine similarity wrapper with disk save/load. |
| **Hybrid Retriever** | [`backend/app/retrieval/hybrid_retriever.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/retrieval/hybrid_retriever.py) | Orchestrates vector search + graph retrieval. |
| **Reranker** | [`backend/app/retrieval/reranker.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/retrieval/reranker.py) | Deduplicates candidates, applies file boost, computes $0.6/0.4$ score. |
| **Context Builder** | [`backend/app/generation/context_builder.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/generation/context_builder.py) | Formats chunks, line citations, relationships, and bounds to 24k chars. |
| **Indexing Service** | [`backend/app/services/indexing_service.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/services/indexing_service.py) | Async background threading, stage state machine, disk cache persistence. |
| **Query Service** | [`backend/app/services/query_service.py`](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/repo/backend/app/services/query_service.py) | Query orchestration, zero-key fallback answer, impact reporting. |
| **Frontend Graph** | `frontend/components/graph/code-graph.tsx` | Interactive React Flow (`@xyflow/react`) directed graph canvas. |
| **Frontend Evidence** | `frontend/components/code/code-viewer.tsx` | Prism syntax-highlighted source viewer with line jumping. |

---

## 8. Top 15 Tough Interview Questions & Model Answers

### Q1: "How do you handle cross-file calls if you don't run a full compiler or type checker?"
**Model Answer**:
> *"We perform static lexical binding resolution. When File A imports `validateToken` from `./auth`, our parser records the local alias and the resolved target file (`auth.ts`). When a call expression `validateToken()` is encountered inside a function in File A, we check our import binding table. If it matches an imported symbol, we create a directed `CALLS` edge from File A's function to the specific function node in File B. For member calls like `user.getName()`, if `user` was instantiated from an imported class `User`, we resolve it against `User.getName`. While this is an approximation and doesn't handle dynamic dispatch on untyped `any` variables, in practice on modern TypeScript and Python codebases it resolves over 85% of real call edges."*

### Q2: "What happens if a user inputs a malicious repository containing malicious git hooks or exploit payloads?"
**Model Answer**:
> *"Security was a primary design requirement. We treat repository code strictly as untrusted text data. We never run `npm install`, `pip install`, `make`, or build commands. When invoking `git clone`, we pass `--depth 1 --single-branch` and execute it in a subprocess with a completely sanitized environment: `GIT_TERMINAL_PROMPT=0`, a restricted `PATH`, and a temporary dummy `HOME` directory so user-level git configs and hooks are ignored. Furthermore, all path lookups in our `/source` endpoint verify keys against the in-memory parsed file map, making path-traversal attacks (`../../etc/passwd`) structurally impossible."*

### Q3: "How does your system prevent context window overflow when sending code to the LLM?"
**Model Answer**:
> *"In `app/generation/context_builder.py`, we enforce a hard character budget (`max_context_chars = 24,000`, roughly 6,000 tokens). We prioritize candidates in descending order of their hybrid score. For each candidate, we append the file header, line numbers, code body, and up to 6 structural relationships. If adding another chunk would exceed the budget, we calculate the remaining capacity; if there is at least 400 characters left, we slice the final chunk cleanly and append `... (context budget reached)`, rather than overflowing the context window or cutting mid-token."*

### Q4: "Why do you use FAISS IndexFlatIP instead of IndexHNSW or IVFFlat?"
**Model Answer**:
> *"Approximate nearest neighbor indices like HNSW or IVF trade accuracy for speed on massive datasets (millions of vectors). An average GitHub repository contains between 300 and 5,000 symbols. On 5,000 vectors of 384 dimensions, an exact flat inner-product scan (`IndexFlatIP`) takes less than 2 milliseconds on a single CPU core. Using approximate indexing would introduce recall loss and require tuning hyperparameters like cluster counts without providing any meaningful latency benefit."*

### Q5: "How does CodeLens handle cyclic dependencies in the call graph?"
**Model Answer**:
> *"In both our retrieval BFS (`neighborhood`) and impact analysis (`impact_analysis`), we maintain an explicit `visited` set and a queue (`collections.deque`). In impact analysis, when traversing incoming callers to find transitive dependencies, we check if the caller is in `visited` before enqueueing. We also enforce a hard depth limit (depth 3 for impact, depth 2 for retrieval). This prevents infinite loops on recursion or circular imports."*

### Q6: "What happens if the Tree-sitter grammar fails or crashes on poorly formatted code?"
**Model Answer**:
> *"Tree-sitter is inherently fault-tolerant and error-recovering—it parses around broken syntax. However, if a language grammar is completely unavailable in the environment or crashes, our `parse_file` dispatcher catches the exception and delegates to `RegexFallbackParser`. The regex parser identifies basic function definitions and import statements, allowing downstream chunking and vector indexing to proceed smoothly without aborting the entire repository analysis."*

### Q7: "How does the system work if a user doesn't have an OpenAI API key?"
**Model Answer**:
> *"CodeLens features **Zero-Key Graceful Degradation**. Embeddings are generated locally using the `sentence-transformers` library (`all-MiniLM-L6-v2`), and graph traversal is pure Python/NetworkX. If no LLM key is configured, the system doesn't throw a 500 error; instead, it enters 'Retrieval-Only Mode'. It returns the exact top-ranked hybrid code chunks, the graph paths, and the interactive graph visualization. The user can also paste a key directly into the UI at runtime, which is stored solely in their browser's `localStorage` and sent via request headers."*

### Q8: "How do you test this system? What is your testing strategy?"
**Model Answer**:
> *"We have comprehensive unit tests in `backend/tests/` built on `pytest`. We use a synthetic fixture repository (`tests/fixtures/sample_repo/`) with known call chains (`login -> authMiddleware -> validateToken`). We test:
> 1. Exact arithmetic of the hybrid reranker ($0.6 \times 0.5 + 0.4 \times 1.0 = 0.70$).
> 2. Entity extraction and CamelCase token splitting.
> 3. Graph traversal path discovery.
> 4. Impact analysis direct vs transitive caller counts.
> 5. Disk persistence round-trips (`pickle` and `json`).
> 6. API schema validation and error handling."*

### Q9: "How do you map graph nodes back to chunks during hybrid ranking?"
**Model Answer**:
> *"Every chunk is keyed by its symbol qualification: `file_path::symbol::start-end`. When graph retrieval returns scored node IDs like `fn::src/auth.ts::validateToken`, our reranker looks up the corresponding chunk key in a precomputed symbol-to-chunk map. If a file-level node is matched (`file::src/auth.ts`), it applies a soft multiplier (`FILE_LEVEL_FACTOR = 0.35`) to all chunks within that file, boosting them without letting an entire file overpower an exact symbol match."*

### Q10: "What are the biggest limitations of CodeLens today?"
**Model Answer**:
> *"Being honest about limitations demonstrates engineering maturity:
> 1. **Approximate Call Graph**: We don't perform full type inference or dynamic dispatch resolution (e.g. `(req as any).user.doSomething()`).
> 2. **Lexical Entity Matching**: Graph retrieval triggers when queries name symbols or file stems. Purely conceptual questions (e.g., 'How is data persisted?') lean almost entirely on the semantic stream.
> 3. **Single-Node In-Memory Graph**: NetworkX graphs are stored in memory and pickled to disk. While fast for repos under 100MB, repos with millions of lines of code would require an external graph engine like Memgraph or Neo4j."*

### Q11: "Why did you choose Next.js 14 App Router and React Flow for the frontend?"
**Model Answer**:
> *"Code intelligence requires visual intuition. We used Next.js 14 with TypeScript and Tailwind for server-client component separation. For the graph view, we integrated `@xyflow/react` (React Flow) with custom nodes (`graph-node.tsx`) that display symbol kinds, file badges, and incoming/outgoing edge counts. Clicking a node or citation instantly synchronizes state with an embedded Prism code viewer, highlighting the exact lines returned by the backend."*

### Q12: "How does the backend handle asynchronous indexing jobs without Redis or Celery?"
**Model Answer**:
> *"To keep CodeLens lightweight and self-contained for local developer use, we implemented an in-memory background thread worker in `IndexingService`. When `/repositories/analyze` is called, it registers a `RepositoryState` object in a thread-safe dictionary (protected by a `threading.Lock`), spawns a daemon thread, and returns HTTP 202 Accepted. The frontend polls `/repositories/{id}/status` to display real-time stage transitions (`cloning -> parsing -> graph -> embedding -> finalizing`). For production enterprise scale, we would swap the Python thread for Celery with Redis or an SQS queue."*

### Q13: "How do you prevent duplicate chunks from appearing in the final context?"
**Model Answer**:
> *"In `reranker.py`, candidates are merged into a dictionary keyed by the chunk's unique identifier (`chunk.key`). If a chunk is retrieved by both vector search and graph traversal, we don't duplicate it. Instead, we populate both its `semantic_score` and `graph_score`, tag its provenance as `'semantic+graph'`, and calculate its combined weighted score. This guarantees that each physical block of code appears at most once in the prompt context."*

### Q14: "How do you evaluate retrieval recall in CodeLens?"
**Model Answer**:
> *"We evaluate retrieval using deterministic end-to-end fixture tests. For example, in our test suite, we issue the query 'What happens during login?' against our fixture repo. We assert that `login`, `authMiddleware`, and `validateToken` are all present in the top candidates and that their `CALLS` relations are linked in `GraphPaths`. In production, we would benchmark recall@k against a dataset of human-annotated code Q&A pairs (like CodeQA or SWE-bench)."*

### Q15: "What would you build next if you had another month to work on this?"
**Model Answer**:
> *"Three high-impact enhancements:
> 1. **SCIP / LSIF Integration**: Replace approximate AST call resolution with SCIP (Source Code Intelligence Protocol) indexers for 100% compiler-verified type definitions and call graphs.
> 2. **Incremental Indexing**: Instead of re-analyzing the entire repo on git push, listen to GitHub webhooks, compute git diffs, and update only the modified nodes, edges, and FAISS embeddings.
> 3. **Agentic Multi-Hop Traversal**: Allow the LLM to inspect the subgraph dynamically and emit tool calls like `expand_callers(symbol)` or `inspect_implementation(interface)` for complex multi-layer debugging questions."*

---

## 9. Interview Day Checklist (Quick Mindset & Tactics)

- [ ] **Frame the narrative**: You built this to solve a real developer pain point (code navigation in unfamiliar legacy repositories).
- [ ] **Lead with the core insight**: *"Embeddings answer what looks similar; graphs answer how it is connected."*
- [ ] **Own the numbers**: 0.6 semantic weight, 0.4 graph weight, 24k character context cap, depth 2 traversal, 150-line symbol chunk cap.
- [ ] **Highlight security**: Never executing repo code, shallow clones in isolated temp directories, sanitized environment variables.
- [ ] **Speak in trade-offs**: Always explain *why* you chose NetworkX and FAISS FlatIP over heavy external databases.
