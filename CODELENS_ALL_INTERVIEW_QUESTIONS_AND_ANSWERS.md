# CodeLens: The Complete 38-Question Interview Question & Answer Bank

> [!IMPORTANT]
> This question bank is designed to prepare you for any technical interview level (Junior, Mid, Senior, and Staff/Lead) where **CodeLens** is discussed.
> Every answer is grounded directly in the actual CodeLens implementation (`backend/app/...`), using exact file paths, algorithms, mathematical formulas, and engineering trade-offs.

---

## Table of Contents
1. [Category 1: Core Philosophy & Architecture (Q1 – Q5)](#category-1-core-philosophy--architecture)
2. [Category 2: Ingestion, AST Parsing & Structural Chunking (Q6 – Q10)](#category-2-ingestion-ast-parsing--structural-chunking)
3. [Category 3: Graph Construction & Graph Algorithms (Q11 – Q16)](#category-3-graph-construction--graph-algorithms)
4. [Category 4: Vector Retrieval & Embeddings (Q17 – Q20)](#category-4-vector-retrieval--embeddings)
5. [Category 5: Hybrid Reranking & Context Construction (Q21 – Q25)](#category-5-hybrid-reranking--context-construction)
6. [Category 6: System Design, Scalability & Concurrency (Q26 – Q30)](#category-6-system-design-scalability--concurrency)
7. [Category 7: Security, Sandboxing & Vulnerability Defense (Q31 – Q33)](#category-7-security-sandboxing--vulnerability-defense)
8. [Category 8: Tough Senior Engineering & Behavioral "War Stories" (Q34 – Q38)](#category-8-tough-senior-engineering--behavioral-war-stories)

---

## Category 1: Core Philosophy & Architecture

### Q1: "Why did you build CodeLens? What is fundamentally broken with standard vector RAG on source code?"
**Model Answer**:
> "Standard vector RAG was designed for prose, where semantic similarity strongly correlates with relevance. Source code is fundamentally different: it is a **directed, interconnected execution graph**.
> 
> Vector RAG fails on code in three major ways:
> 1. **Execution Flow Obliviousness**: If a user asks *'What happens when a user logs in?'*, vector search fetches files that happen to mention 'login' (e.g. tests, UI buttons, schema definitions). It completely misses the operational execution chain: `login -> authMiddleware -> validateToken -> createSession`.
> 2. **Reverse Dependency Blindness**: Vector search cannot answer blast radius questions like *'What breaks if I change `validateToken()`?'* because embeddings have no concept of inbound callers, module importers, or subclasses.
> 3. **Arbitrary Chunk Boundaries**: Slicing code by fixed token counts (e.g. 500 tokens) cuts functions in half, separating docstrings and signatures from logic.
>
> In CodeLens, our core thesis is: **Embeddings answer what code looks similar; the knowledge graph answers how code is connected.** By fusing both streams, we give the LLM verified structural context that eliminates hallucinated call chains."

---

### Q2: "Why not just use an ultra-long context window model like Gemini 1.5 Pro (2M tokens) and dump the whole repository into the prompt?"
**Model Answer**:
> "While modern LLMs boast million-token context windows, dumping an entire repository into the prompt has severe production drawbacks:
> 1. **Needle-in-a-Haystack Degradation**: Even with million-token windows, recall degrades when reasoning over complex multi-file relationships scattered across 800,000 tokens of boilerplate, CSS, and tests.
> 2. **Latency**: Prompt processing (Time to First Token / TTFT) for 500k+ tokens takes 15 to 30 seconds. CodeLens retrieves and reranks in **under 20 milliseconds**, delivering near-instant responses.
> 3. **Cost**: At \$2.50 to \$10.00 per million input tokens, passing an entire repo on every query costs 50¢ to \$2.00 per question. With CodeLens, our context budget is strictly capped at **24,000 characters** (~6,000 tokens), costing fractions of a cent.
> 4. **Deterministic Features**: Long context still cannot power an interactive, visual dependency graph or an automated **Impact Analysis Engine** that deterministically calculates blast radius."

---

### Q3: "Why not fine-tune an LLM on the repository instead of using RAG?"
**Model Answer**:
> "Fine-tuning updates the model's parametric weights, which is the wrong tool for codebase intelligence:
> 1. **Frequent Code Changes**: Software repos update constantly. Fine-tuning after every commit or pull request is computationally impossible and financially prohibitive. CodeLens indexes a typical repo in 15 seconds.
> 2. **Hallucination & Provenance**: Fine-tuned models cannot cite exact line numbers reliably; they generate plausible-sounding code from memory. CodeLens provides verified, clickable source citations pointing to exact lines (`lib/application.js:256-258`).
> 3. **Access Control & Privacy**: Parametric knowledge leaks across users. With RAG, the index is isolated per repository and can be deleted or updated instantly."

---

### Q4: "Can you walk me through the high-level request lifecycle when a user asks a question in CodeLens?"
**Model Answer**:
> "When a question arrives at `POST /repositories/{id}/query`:
> 1. **Parallel Retrieval**:
>    - **Semantic stream**: The query is embedded via sentence-transformers and searched against our FAISS `IndexFlatIP` vector index to retrieve the top 8 cosine-similar code chunks (`VECTOR_TOP_K = 8`).
>    - **Graph stream**: Question identifiers are extracted, cleaned of stopwords, and matched against graph nodes. We execute a Breadth-First Search (BFS) to depth 2, applying an exponential distance decay ($0.5^{(\text{distance} + 1)}$) to score neighboring symbols and shortest paths.
> 2. **Deterministic Reranking**: In `reranker.py`, candidates are merged by chunk key, file-level nodes softly boost member chunks ($0.35 \times \text{node\_score}$), and we compute $\text{FinalScore} = 0.6 \cdot \text{Semantic} + 0.4 \cdot \text{Graph}$.
> 3. **Context Construction**: `context_builder.py` selects the top candidates within a 24,000-character budget, formatting each chunk with its file path, line range, up to 6 structural relations, and graph paths.
> 4. **LLM Generation**: The prompt is dispatched to `gpt-4o-mini` (or Groq). If no API key is provided, it gracefully degrades to 'Retrieval-Only Mode' returning the top hybrid chunks without failing.
> 5. **Frontend Response**: The API returns the answer, source line citations, and the exact sub-graph of nodes and edges rendered in React Flow."

---

### Q5: "What are the core metrics and constants used in your pipeline?"
**Model Answer**:
> "All pipeline tunables are centralized in `backend/app/core/config.py`:
> - `vector_top_k`: **8** (initial semantic hits from FAISS).
> - `graph_depth`: **2** (hops traversed from matched symbol seeds).
> - `final_top_k`: **8** (final candidates passed to context builder).
> - `semantic_weight`: **0.6** / `graph_weight`: **0.4** (fusion balance).
> - `file_level_factor`: **0.35** (boost given to chunks inside a matched file).
> - `max_context_chars`: **24,000** (~6,000 tokens context ceiling).
> - `max_repository_size_mb`: **100 MB** (ingestion safety cap).
> - `max_file_size_kb`: **1,024 KB** (1 MB per file limit).
> - `max_files`: **5,000** (repository file count ceiling)."

---

## Category 2: Ingestion, AST Parsing & Structural Chunking

### Q6: "Why did you use Tree-sitter instead of standard compiler frontends like TypeScript's `tsc` or Python's `ast` module?"
**Model Answer**:
> "We used `tree-sitter-language-pack` for three reasons:
> 1. **Cross-Language Uniformity**: Tree-sitter provides a single, unified C-based AST interface across TypeScript, JavaScript, and Python. We don't have to maintain separate runtime bridges for Node.js and Python.
> 2. **Error Tolerance**: Traditional compilers (`tsc`) fail fast and abort when syntax errors or missing dependencies occur. In contrast, Tree-sitter is an incremental, error-recovering parser designed for IDEs—it parses around broken lines and still gives us valid AST nodes for the rest of the file.
> 3. **Zero Build Requirement**: Compilers require installing all dependencies (`node_modules`), configuring `tsconfig.json`, and running package managers. Tree-sitter parses raw source text in milliseconds with zero dependencies installed."

---

### Q7: "What happens if Tree-sitter crashes or a language grammar is missing?"
**Model Answer**:
> "In `backend/app/parsing/code_parser.py`, we implemented the `parse_file` abstraction with a resilient fallback mechanism.
> 
> When the service initializes, it attempts to import and initialize Tree-sitter. If Tree-sitter is missing, or if parsing a specific corrupted file throws an unhandled exception, the code catches it and automatically delegates to `RegexFallbackParser`. 
> 
> The regex parser uses targeted regular expressions (`_PY_DEF`, `_JS_FUNC`, `_PY_IMPORT`, etc.) to discover function names, classes, and imports. While less precise with nested scopes, it guarantees that downstream chunking and vector indexing never fail completely."

---

### Q8: "How does CodeLens chunk source code, and why is it superior to token-window chunking?"
**Model Answer**:
> "Implemented in `app/parsing/chunker.py`, CodeLens uses **AST-aligned structural chunking**:
> 1. **1 Chunk = 1 Symbol**: Every chunk corresponds exactly to an AST function, method, or class node.
> 2. **Unique Coordinate Keys**: Each chunk is keyed by `file_path::symbol::start_line-end_line` (e.g. `lib/application.js::app.route::256-258`).
> 3. **Metadata Enrichment for Embeddings**: The text passed to the embedding model is prepended with semantic context:  
>    `{file_path} | {symbol} ({symbol_type})\n{code}`
> 4. **Boundaries & Fallbacks**: Large symbols are capped at 150 lines (`MAX_SYMBOL_LINES = 150`). Files without extractable symbols (like procedural scripts or configs) fall back to an 80-line sliding window.
> 
> **Why it's superior**: Fixed-token windows (e.g. 500 tokens) split code arbitrarily across line boundaries. Structural chunking ensures that every retrieved chunk is syntactically coherent, maps 1:1 to a graph node, and allows exact line highlighting in the UI."

---

### Q9: "How do you filter out irrelevant or generated files during ingestion?"
**Model Answer**:
> "In `app/ingestion/file_filter.py`, we apply multi-layered filtering before parsing:
> 1. **Directory Blacklist**: Skips 24 standard noise directories including `.git`, `node_modules`, `dist`, `build`, `out`, `.next`, `coverage`, `__pycache__`, `.venv`, and `vendor`.
> 2. **File Pattern Exclusion**: Ignores minified and generated code: `_EXCLUDED_FILE_PATTERNS = ('.min.', '.d.ts', '.bundle.', '.generated.')`.
> 3. **Binary File Detection**: We read the first 8,192 bytes of every file. If a null byte `b'\x00'` is present, it's flagged as binary and skipped immediately.
> 4. **Size Caps**: Any file exceeding 1,024 KB is discarded to prevent out-of-memory errors on massive lockfiles or test fixtures."

---

### Q10: "How do you extract call expressions and distinguish method calls on `this`/`self` from external imports?"
**Model Answer**:
> "In `app/parsing/ast_parser.py`, our Tree-sitter AST visitor traverses call nodes (`call_expression` in TS/JS, `call` in Python):
> - If the callee is a bare identifier (e.g. `validateToken()`), `CallDecl.base` is `None`.
> - If the callee is a member access (e.g. `this.router.route()` or `user.getName()`), we extract the receiver object as `CallDecl.base` and the property as `CallDecl.name`.
> - When `base` is `'this'` or `'self'`, the graph builder looks up the enclosing class of the caller function and links the call to that specific class's method node.
> - When `base` matches an imported namespace handle (e.g. `import * as auth from './auth'`), it maps to the target file's exported symbol."

---

## Category 3: Graph Construction & Graph Algorithms

### Q11: "Explain how you resolve cross-file dependencies without running a full compiler type-checker."
**Model Answer**:
> "In `app/graph/graph_builder.py`, we implemented static lexical module and binding resolution:
> 1. **Module Resolution**: For TypeScript/JavaScript, relative paths (`./auth`) are resolved against candidate extensions (`.ts`, `.tsx`, `.js`) and directory indexes (`./auth/index.ts`). For Python, dotted imports (`app.services.token`) are resolved by converting dots to directory paths and checking for `__init__.py`.
> 2. **Import Binding Table**: We map `import_bindings[importer_path][local_alias] = (target_file, exported_name)`.
> 3. **Call Resolution (`_resolve_call_target`)**:
>    - If `call.name` is called directly without a base: check same-file top-level functions first. If not found, check `import_bindings` to find the target file and symbol.
>    - If `call.base` is `'this'` or `'self'`: resolve against methods in the current class.
>    - If `call.base` matches an imported class: resolve against methods defined on that class in the target file.
> 
> This heuristic static approach resolves the vast majority of cross-file calls in structured codebases with zero compile-time overhead."

---

### Q12: "What is your graph data structure, and what nodes and edges exist in it?"
**Model Answer**:
> "We use NetworkX's `MultiDiGraph` (directed multigraph), which allows multiple directed edges between pairs of nodes with relationship attributes.
> 
> **Nodes**:
> - `repo::{name}` (root repository node)
> - `file::{path}` (source file)
> - `fn::{path}::{qualname}` (function or method, e.g. `fn::app/auth.py::AuthService.validate`)
> - `cls::{path}::{name}` (class definition)
> 
> **Edges**:
> - `CONTAINS`: `repo -> file`, `file -> fn/cls`, `cls -> method`.
> - `IMPORTS`: `file -> file`.
> - `CALLS`: `fn/method -> fn/method`.
> - `EXTENDS`: `cls -> parent cls` (class inheritance).
> - `REFERENCES`: `fn -> cls` (functions instantiating or referencing imported classes)."

---

### Q13: "How does the question entity matching algorithm work?"
**Model Answer**:
> "In `app/graph/graph_query.py:match_entities`:
> 1. **Identifier Extraction**: We clean backticks and parentheses, run regex `[A-Za-z_][A-Za-z0-9_]{1,}`, split CamelCase (`authMiddleware -> auth, Middleware`), and filter out a set of 50+ English programming stopwords ('explain', 'does', 'call', 'function', 'test', etc.).
> 2. **Deterministic Tiered Matching**:
>    - **Exact Symbol Match (Score 1.0)**: If a token matches a function or class node name exactly (case-insensitive).
>    - **File Stem Match (Score 0.8)**: If a token matches the stem of a file name (e.g. 'Router' matches `Router.js`).
>    - **Substring Token Match (Score 0.4)**: If a token with $\ge 4$ characters is contained within a symbol name (e.g. 'token' inside `validateToken`). Used only as a fallback seed if no exact match exists."

---

### Q14: "Explain the BFS neighborhood traversal and exponential hop decay formula."
**Model Answer**:
> "In `app/graph/graph_query.py:neighborhood`:
> We start a Breadth-First Search (BFS) using a FIFO queue (`collections.deque`) seeded with the matched entities.
> - We only traverse structural relations: `CONTAINS`, `IMPORTS`, `CALLS`, `EXTENDS`, `REFERENCES`. Repository-to-file edges are excluded to prevent noisy traversal across unrelated files.
> - As we visit each unvisited neighbor at distance $d \in [1, \text{depth}]$, we assign a decayed score:
>   $$\text{Decay}(d) = 0.5^{(d + 1)}$$
> - At hop 1 (direct neighbor): Score is $0.5^1 = 0.50$.
> - At hop 2 (neighbor of neighbor): Score is $0.5^2 = 0.25$.
> - Traversal terminates when depth reaches `graph_depth` (default 2) or when `max_nodes` (default 30) is reached.
> 
> This guarantees that direct callers and callees receive higher priority in the context builder than distant dependencies."

---

### Q15: "How does the Shortest Graph Path algorithm work?"
**Model Answer**:
> "In `app/graph/graph_query.py:graph_paths`:
> When a user's question mentions two or more distinct symbols (e.g. *'How does login communicate with validateToken?'*):
> 1. We take the top symbol seeds and project an undirected structural view of the graph.
> 2. We run NetworkX's `nx.shortest_path()` between pairs of seeds.
> 3. Paths with length between 3 and 6 hops are formatted into human-readable chains:  
>    `login() -> authMiddleware() -> validateToken()`
> 4. These paths are explicitly injected into the prompt header under `GRAPH PATHS:`, enabling the LLM to explain the exact multi-file flow without having to guess."

---

### Q16: "How does the Impact Analysis Engine calculate blast radius and determine severity?"
**Model Answer**:
> "In `app/graph/graph_query.py:impact_analysis`:
> When a symbol `target` is analyzed:
> 1. **Direct Callers**: Scans inbound edges where `relation == 'CALLS'`.
> 2. **Transitive Callers**: Runs a BFS traversal up to depth 3 on inbound `CALLS` edges with a `visited` set to capture callers-of-callers.
> 3. **Dependent Files**: Finds inbound `IMPORTS` edges targeting the symbol's parent file.
> 4. **Affected Tests**: Filters all affected caller nodes against a regex:  
>    `(^|/)(tests?|__tests__)/|[_\-.](test|spec)\.|^test_`
> 5. **Deterministic Severity Classification**:
>    - **HIGH**: Direct callers $\ge 4$ OR Total affected symbols $\ge 8$.
>    - **MEDIUM**: Direct callers $\ge 1$ OR Total affected symbols $\ge 3$.
>    - **LOW**: Isolated symbol with 0 callers.
> 6. The structured facts are returned to the frontend and optionally summarized by the LLM using `IMPACT_SYSTEM_PROMPT`."

---

## Category 4: Vector Retrieval & Embeddings

### Q17: "Why use FAISS IndexFlatIP instead of an approximate index like IndexHNSW or IVF?"
**Model Answer**:
> "FAISS `IndexFlatIP` performs an exhaustive, exact inner-product search over float32 vectors.
> 
> Approximate Nearest Neighbor (ANN) algorithms like HNSW or IVFFlat are designed for datasets with millions of vectors where linear scanning is too slow. However:
> - An average repository has between 300 and 5,000 symbol chunks.
> - An exhaustive flat scan over 5,000 vectors of 384 dimensions takes **less than 2 milliseconds** on a single CPU core.
> - FlatIP gives **100% recall** with zero approximation error, eliminates index construction latency, and avoids complex tuning of hyperparameters like $M$ and $efSearch$."

---

### Q18: "Why does Inner Product (IP) equal Cosine Similarity in your vector store?"
**Model Answer**:
> "Cosine similarity between vectors $u$ and $v$ is defined as:
> $$\text{CosineSimilarity}(u, v) = \frac{u \cdot v}{\|u\|_2 \|v\|_2}$$
> In `app/retrieval/embeddings.py:_normalize`, we apply L2-normalization to every vector immediately after generation:
> $$u_{\text{norm}} = \frac{u}{\|u\|_2} \implies \|u_{\text{norm}}\|_2 = 1$$
> When both query and chunk vectors have unit norm, the denominator equals 1:
> $$\text{CosineSimilarity}(u_{\text{norm}}, v_{\text{norm}}) = u_{\text{norm}} \cdot v_{\text{norm}}$$
> Therefore, a simple inner product computed via BLAS dot product in `IndexFlatIP` is mathematically identical to exact cosine similarity."

---

### Q19: "How does CodeLens support both local embeddings and cloud embeddings?"
**Model Answer**:
> "In `app/retrieval/embeddings.py`, we defined an `EmbeddingProvider` Python protocol with a unified method:
> `embed_texts(self, texts: list[str]) -> np.ndarray`
> 
> We have two concrete implementations:
> 1. `SentenceTransformerProvider`: Loads `all-MiniLM-L6-v2` locally using PyTorch/HuggingFace. It runs on CPU/GPU, is completely free, and requires no API keys or internet connection.
> 2. `OpenAIEmbeddingProvider`: Calls OpenAI's `text-embedding-3-small` API in batches of 64 chunks.
> 
> Switching between them is a simple environment variable change (`EMBEDDING_PROVIDER=local` or `openai`), with zero changes to the retrieval or indexing pipeline."

---

### Q20: "How do you handle vector store persistence across server restarts?"
**Model Answer**:
> "In `app/retrieval/vector_store.py`:
> - The FAISS binary index is persisted directly to disk using `faiss.write_index(index, 'vectors/index.faiss')`.
> - Because FAISS only stores integer IDs ($0, 1, 2, \dots$), we write a paired JSON sidecar `vectors/meta.json` containing the mapping: `{"keys": [chunk_key_0, chunk_key_1, ...]}`.
> - On server restart, `VectorStore.load()` reads the FAISS binary and JSON sidecar in under 5ms, avoiding any need to recompute embeddings."

---

## Category 5: Hybrid Reranking & Context Construction

### Q21: "Why choose weighted score fusion (0.6/0.4) over a Cross-Encoder or neural reranker?"
**Model Answer**:
> "Cross-encoders pass the query and candidate chunk together through full transformer cross-attention layers. While effective for ambiguous web search, we avoided them for CodeLens because:
> 1. **Inference Latency**: A cross-encoder adds 200–500ms of GPU/CPU latency per query, whereas our fusion algorithm runs in under 1 millisecond.
> 2. **Model Footprint**: Cross-encoders require an additional 500MB–1.5GB model loaded into memory, increasing hosting costs.
> 3. **Explainability & Trust**: In enterprise code search, engineers want to know *why* a file was retrieved. Our weighted fusion provides clear provenance:
>    - `semantic+graph`: Both text and structural dependencies matched.
>    - `graph`: Code was found because it was in the call path of a matched symbol.
>    - `semantic`: Code was found via textual/docstring similarity.
> 4. **Tunability**: The weights are exposed in config (`SEMANTIC_WEIGHT = 0.6`, `GRAPH_WEIGHT = 0.4`) and can be adjusted without retraining."

---

### Q22: "How does file-level graph boosting work in `reranker.py`?"
**Model Answer**:
> "In `app/retrieval/reranker.py`, graph retrieval can match file-level nodes (e.g. `file::lib/router.js` with score 0.80).
> 
> If we mapped the file score directly to all functions in that file, a 1,000-line file would flood the top-k results. Instead, we apply a dampening factor:
> $$\text{Boost} = \text{FILE\_LEVEL\_FACTOR} \times \text{NodeScore} \quad (\text{where } \text{FILE\_LEVEL\_FACTOR} = 0.35)$$
> All chunks belonging to `lib/router.js` receive a soft graph score boost of $0.35 \times 0.80 = 0.28$. This bubbles up relevant sibling functions in the same module without drowning out exact function-level matches."

---

### Q23: "How do you deduplicate candidates that appear in both the vector search and graph search?"
**Model Answer**:
> "In `app/retrieval/reranker.py:merge_and_rank`:
> We maintain a hash map of `Candidate` objects keyed by the chunk's unique coordinate key (`file_path::symbol::start-end`).
> 1. First, all vector search hits populate `candidates[key].semantic_score`.
> 2. Next, graph nodes map back to chunk keys. If a chunk key already exists in the map, its `graph_score` is updated in-place:
>    `candidate.graph_score = max(candidate.graph_score, node_score)`
> 3. If it doesn't exist, a new `Candidate` is created with `semantic_score = 0.0`.
> 4. We compute $\text{FinalScore} = 0.6 \cdot S_{\text{semantic}} + 0.4 \cdot S_{\text{graph}}$ and sort descending.
> 
> This guarantees that no physical block of code is duplicated in the context window."

---

### Q24: "How does the Context Builder prevent context window overflow while preserving critical relationships?"
**Model Answer**:
> "In `app/generation/context_builder.py`:
> 1. We define a hard ceiling: `max_context_chars = 24,000` (~6,000 tokens).
> 2. We iterate over sorted candidates in descending final score order.
> 3. For each candidate, we generate a compact header with exact coordinates (`FILE:`, `SYMBOL:`, `LINES:`), followed by the source code and up to 6 verified structural relationships (`fnA CALLS fnB`).
> 4. If adding the next full chunk exceeds `max_context_chars`, we check if at least 400 characters remain in the budget. If so, we cleanly truncate the code body and append `... (context budget reached)`.
> 5. Finally, we append the shortest graph paths connecting the question's seeds.
> 
> This deterministic packing guarantees that the LLM context never overflows while ensuring the most important call connections are always visible."

---

### Q25: "How does the prompt enforce that the LLM cites exact lines and does not hallucinate?"
**Model Answer**:
> "In `app/generation/prompts.py:SYSTEM_PROMPT`, we apply strict grounding instructions:
> - *'Answer using only the provided repository context.'*
> - *'Never invent files, functions, classes, dependencies, or behavior.'*
> - *'Cite evidence inline using the exact file path and line range, e.g. src/middleware/auth.ts:10-31.'*
> - *'When graph relationships are supplied, use them to explain execution flow, e.g. authMiddleware() -> validateToken().'*
> - *'Distinguish observed code behavior from your own inference, and clearly state when the supplied context is insufficient.'*
> 
> By forcing inline coordinate citations, every claim in the LLM's answer maps to a clickable link that opens the evidence code viewer in the frontend."

---

## Category 6: System Design, Scalability & Concurrency

### Q26: "How does CodeLens handle asynchronous indexing without blocking the FastAPI event loop?"
**Model Answer**:
> "In `app/services/indexing_service.py`:
> 1. When `POST /repositories/analyze` is called, the request validates the GitHub URL and immediately creates a `RepositoryState` record with status `'indexing'` and stage `'cloning'`.
> 2. The indexing workflow is dispatched into a daemon background thread:
>    `threading.Thread(target=self._run_indexing, args=(state,), daemon=True)`
> 3. The endpoint immediately returns `HTTP 202 Accepted` with the repository ID.
> 4. Shared state dictionaries (`self._states` and `self._loaded`) are synchronized using a `threading.Lock`.
> 5. The frontend polls `GET /repositories/{id}/status` every second to render real-time progress across all 5 stages (`cloning -> parsing -> graph -> embedding -> finalizing`)."

---

### Q27: "What happens if the backend server restarts while an analysis is in progress?"
**Model Answer**:
> "In `app/services/indexing_service.py:_restore_from_disk`:
> When the server starts up, it scans the storage directory (`data/repositories/*/index.json`).
> - If an `index.json` has `status == 'completed'`, the repository is loaded into memory as available.
> - If an `index.json` has `status != 'completed'` (indicating the process was killed mid-indexing), the incomplete directory is completely purged via `shutil.rmtree()` to prevent corrupted index artifacts from being served.
> - Furthermore, during indexing, `index.json` is only written to disk at the very end of the `'finalizing'` stage once the FAISS index and graph pickle are safely written."

---

### Q28: "How would you scale CodeLens to handle repositories with 10 million lines of code (like the Linux kernel or Chromium)?"
**Model Answer**:
> "Scaling to a 10M LOC monolith requires three architectural upgrades:
> 1. **Distributed Graph Engine**: Replace in-memory NetworkX with a distributed property graph database like **Memgraph** or **Neo4j**, sharded by module/package. Graph queries would be executed via Cypher with index-backed node lookups.
> 2. **Scalable Vector Index**: Replace FAISS `IndexFlatIP` with a partitioned vector database like **Milvus** or **Qdrant**, utilizing HNSW indexing with scalar quantization to fit millions of vectors in memory.
> 3. **Incremental Indexing via Git Diffs**: Instead of cloning and re-parsing 10M lines, listen to GitHub push webhooks. Use `git diff-tree` to identify changed files, re-parse only those files with Tree-sitter, update mutated graph nodes and edges, and delete/insert only affected FAISS vectors."

---

### Q29: "How would you scale the backend to handle 10,000 concurrent developer queries?"
**Model Answer**:
> "1. **Stateless API Replicas**: The FastAPI application would run across multiple Kubernetes pods behind an ALB.
> 2. **Distributed Asynchronous Workers**: Replace Python daemon threads with a distributed task queue (**Celery with Redis** or AWS SQS + ECS workers) for ingestion jobs.
> 3. **Shared Read-Only Storage**: Graph pickles and FAISS indices would be stored on S3/GCS with an in-pod local NVMe cache, or served via dedicated vector/graph database microservices.
> 4. **Query Embedding Cache**: Cache query embeddings in Redis so identical or semantically identical questions bypass the sentence-transformer encoder."

---

### Q30: "How does CodeLens handle memory management for multiple loaded repositories?"
**Model Answer**:
> "In `app/services/indexing_service.py`, loaded indices (`graph`, `chunks`, `vector_store`, `sources`) are cached in a dictionary `self._loaded`.
> 
> In the current version, repositories stay cached in memory for sub-millisecond query response. 
> 
> For multi-tenant production, I would wrap `self._loaded` in an **LRU Cache with a memory budget** (e.g. 8GB max). When the budget is exceeded, the least recently queried repository index is evicted from RAM. Since the artifacts are persisted on disk (`graph.pkl`, `index.faiss`, `chunks.json`), reloading an evicted repo takes under 200ms."

---

## Category 7: Security, Sandboxing & Vulnerability Defense

### Q31: "How do you protect against Arbitrary Code Execution (RCE) when users submit untrusted GitHub repositories?"
**Model Answer**:
> "This is a critical security consideration in CodeLens:
> 1. **Zero Execution Policy**: Repository code is treated strictly as untrusted text. We never execute build scripts, never install dependencies (`npm install`, `pip install`, `setup.py` are strictly banned), and never run compilers.
> 2. **Subprocess Sanitization**: When running `git clone --depth 1`, we sanitize the environment:
>    - `GIT_TERMINAL_PROMPT=0` (disables interactive credential prompts).
>    - `PATH` is restricted strictly to `/usr/bin:/bin:/usr/local/bin`.
>    - `HOME` is redirected to a temporary scratch folder so user-level `~/.gitconfig` or global git hooks cannot be triggered.
> 3. **Filesystem Isolation**: Ingestion runs inside ephemeral temporary directories (`tempfile.mkdtemp(prefix='codelens-')`) that are immediately purged upon completion."

---

### Q32: "How do you prevent Path Traversal attacks (e.g. `../../../../etc/passwd`) in the `/source` endpoint?"
**Model Answer**:
> "In `app/api/graph.py:read_source` and `app/services/query_service.py:read_source`:
> - The API does not accept arbitrary file paths from the disk.
> - Instead, `query_service.read_source()` checks:
>   `content = repo.sources.get(path)`
> - `repo.sources` is an in-memory dictionary populated strictly during indexing from files relative to the repository root.
> - If `path` is not an exact key in that dictionary, it immediately raises a `RepositoryNotFoundError`. It is structurally impossible to traverse the host filesystem."

---

### Q33: "How do you handle API key security if users provide their own OpenAI or Groq keys in the browser?"
**Model Answer**:
> "1. **No Database Persistence**: Runtime API keys are never written to the server's disk, databases, or logs.
> 2. **Client-Side Storage**: Keys are stored strictly in the user's browser `localStorage`.
> 3. **Per-Request Headers**: The key is transmitted directly over HTTPS via custom request headers: `X-LLM-API-Key` and `X-LLM-Provider`.
> 4. **Precedence**: The header key takes precedence over any backend `.env` key for that specific request, ensuring complete tenant isolation."

---

## Category 8: Tough Senior Engineering & Behavioral "War Stories"

### Q34: "What was the most difficult bug you encountered while building CodeLens, and how did you resolve it?"
**Model Answer**:
> "The hardest challenge was **cross-file method call ambiguity in JavaScript/TypeScript**.
> 
> Initially, whenever our parser saw `app.use()` or `router.get()`, it couldn't tell which `get()` or `use()` function was being called across 100 files, causing our knowledge graph to link every call to dozens of identical method names across the repo.
> 
> **How I solved it**:
> I introduced an import-binding table and qualified caller names:
> 1. When parsing imports, we map local bindings to exported symbols: `import { Router } from './router'` maps `Router -> (./router.js, Router)`.
> 2. When a call occurs on a receiver (e.g. `this.router.route()`), we inspect whether `router` was imported or defined as a class property.
> 3. If unresolvable, we deliberately drop the call edge rather than creating a false positive edge. In graph retrieval, a missing edge is far better than a hallucinated edge that pollutes the LLM context with irrelevant files."

---

### Q35: "If you had to start this project over from scratch today, what would you do differently?"
**Model Answer**:
> "I would incorporate **SCIP (Source Code Intelligence Protocol)** or **LSIF (Language Server Index Format)** as an optional first-class tier for compiled languages:
> 
> While Tree-sitter is phenomenal because it requires zero configuration, it cannot do full type inference on complex TypeScript generics or Python dynamic duck typing. 
> 
> In a v2 architecture, I would implement a hybrid parser: use Tree-sitter for instant zero-config indexing, but allow users to provide a SCIP index (generated via `scip-typescript` or `scip-python`) to achieve 100% compiler-verified type definitions and call graphs when precision is paramount."

---

### Q36: "How did you test and validate that your hybrid retrieval actually outperformed standard vector RAG?"
**Model Answer**:
> "We built end-to-end integration tests over a synthetic multi-file test repository in `backend/tests/fixtures/sample_repo/`.
> 
> We tested multi-hop queries like: *'What does login do?'*
> - **Under vanilla vector RAG**: The search only retrieved `login.ts` and test files mentioning 'login'. The actual security validation function `validateToken()` in `tokens.ts` was ranked #14, completely outside the top-8 context window.
> - **Under CodeLens Hybrid RAG**: The graph traversal traced `login -> authMiddleware -> validateToken`. The reranker assigned `validateToken` a high graph score, promoting it to rank #2 in the final context.
> 
> Furthermore, in `backend/tests/test_hybrid.py`, we assert exact arithmetic scoring: verifying that vector score 0.5 and graph score 1.0 produce exactly $0.6(0.5) + 0.4(1.0) = 0.70$."

---

### Q37: "How do you evaluate user feedback on answers when there is no human-in-the-loop?"
**Model Answer**:
> "We focus on **grounding metrics**:
> 1. **Citation Verification**: Every generated answer must include citations in the form `path:start-end`. We programmatically verify that the cited lines exist in our indexed chunk store.
> 2. **Retrieval-Context Overlap**: We check whether the symbols mentioned in the LLM's explanation match the nodes in the retrieved subgraph.
> 3. **User Action Telemetry**: In the UI, whenever a user clicks an inline citation or explores the interactive graph node, it indicates positive engagement with the evidence stream."

---

### Q38: "What was your approach to frontend visualization, and why did you choose React Flow?"
**Model Answer**:
> "Codebase structures are graphs, not lists. Showing developers a flat list of 8 code snippets forces them to mentally reconstruct the architecture.
> 
> We used Next.js 14 App Router and `@xyflow/react` (React Flow):
> 1. **Custom Nodes (`graph-node.tsx`)**: Render color-coded badges for functions, classes, and files, along with live in/out degree badges.
> 2. **Interactive Subgraphs**: When viewing query results, React Flow renders only the retrieved sub-graph (capped at 30 nodes) rather than crashing the browser with 10,000 nodes.
> 3. **Bidirectional State Sync**: Clicking a node in the graph immediately opens the **Evidence Code Viewer**, highlighting the exact lines with Prism syntax highlighting."
