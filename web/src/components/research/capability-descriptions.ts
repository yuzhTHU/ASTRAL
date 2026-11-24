import type { UiLanguage } from "../ui-language";

type Translation = readonly [englishSource: string, chinese: string];
type ToolText = {
  description?: Translation;
  parameters: Record<string, Translation>;
};
type Capability = {
  name: string;
  description?: string;
  description_en?: string;
  description_zh?: string;
};

// Match both the registered ID and the original wording. Workspace skills can
// override built-ins, and saved runs can carry a different version of a schema.
const tools: Record<string, ToolText> = {
  calibrate_observation_scatter: {
    description: [
      "Estimate an extra residual scale from a fixed affine training baseline. Use only when formal independent symmetric errors omit residual scatter, as allowed by the task's observation model. Fits only declared training rows using all allowed predictors and never validation responses. The scale includes baseline misspecification, not just physical scatter. Freeze this before formula search; changing it requires a new search.",
      "基于固定的训练集仿射基线估计额外残差尺度。仅在任务的观测模型允许、且给定的独立对称误差未包含残差散布时使用。使用全部允许的预测变量，仅拟合指定训练行，排除验证集响应。估计尺度同时包含基线设定误差与物理散布。须在搜索公式前冻结此值，修改后需重新搜索。",
    ],
    parameters: {
      apply: [
        "Save extra_scatter and calibration provenance into the discovery contract. False previews without changing any file.",
        "是否将 extra_scatter 和校准来源保存至发现契约。False 仅预览，不修改文件。",
      ],
    },
  },
  call_pysr: {
    description: [
      "Run PySR genetic-programming search to discover nonlinear symbolic formulas. Best for discovering nonlinear combinations of algebraic, trigonometric, exponential, logarithmic, and radical terms. Because evolutionary search is computationally intensive, restrict ``binary_operators``, ``unary_operators``, and input features ``x`` to those motivated by your current hypothesis. Returns a submission-eligible candidate when ``y`` is the default target variable and ``x`` does not depend on ``y``.",
      "使用 PySR 遗传编程搜索非线性符号公式，适合探索代数、三角、指数、对数和根式项的非线性组合。演化搜索开销较高，请根据当前假设限制 binary_operators、unary_operators 和输入特征 x。若 y 为默认目标且 x 不依赖 y，则返回可提交的候选公式。",
    ],
    parameters: {
      binary_operators: [
        'Binary operators to search over, chosen from ``["+", "-", "*", "/", "^"]``.',
        '用于搜索的二元运算符，可选 ["+", "-", "*", "/", "^"]。',
      ],
      unary_operators: [
        'Unary operators to search over, chosen from ``["sin", "cos", "exp", "log", "sqrt", "square", "cube", "abs", "tanh", "sign"]``.',
        '用于搜索的一元运算符，可选 ["sin", "cos", "exp", "log", "sqrt", "square", "cube", "abs", "tanh", "sign"]。',
      ],
      x: [
        'Input variable names or expressions, e.g., ``["x1", "(x1 - x2)**2"]``. Defaults to all numeric non-target variables.',
        '输入变量名或表达式，如 ["x1", "(x1 - x2)**2"]。默认为所有非目标数值变量。',
      ],
      y: [
        'Target variable name or expression, e.g., ``"y"`` or ``"log(y)"``. Defaults to the discovery target.',
        '目标变量名或表达式，如 "y" 或 "log(y)"。默认为发现目标。',
      ],
      timeout: [
        "Search time budget in seconds (10-120, default 30). Increase to 60-120 if an initial run underfits.",
        "搜索时间预算，单位为秒（10–120，默认 30）。初次运行欠拟合时可增至 60–120 秒。",
      ],
      maxsize: [
        "Maximum expression tree node count (10-40, default 25).",
        "表达式树的最大节点数（10–40，默认 25）。",
      ],
      max_samples: [
        "Maximum number of rows subsampled for PySR fitting (default 500).",
        "PySR 拟合子采样的最大行数（默认 500）。",
      ],
      show_diagnostics: [
        "Whether to include residual diagnostics in the evaluation output.",
        "是否在评估输出中包含残差诊断。",
      ],
    },
  },
  call_sindy: {
    description: [
      "Run SINDy sparse regression (STLSQ) over polynomial and optional trigonometric bases. Constructs a library of polynomial/interaction terms (up to ``poly_degree``) and optional Fourier terms (``sin``, ``cos``), then prunes small coefficients using Sequentially Thresholded Least Squares. Fast and well-suited for additive polynomial, interaction, and harmonic laws. Returns a submission-eligible candidate when ``y`` is the default target variable and ``x`` does not depend on ``y``.",
      "使用 SINDy 的序贯阈值最小二乘法（STLSQ）进行稀疏回归。以最高 poly_degree 次的多项式及交互项构造候选库，可加入 sin、cos 傅里叶项，再用 STLSQ 去除小系数项。适用于快速搜索加性多项式、交互和谐波规律。若 y 为默认目标且 x 不依赖 y，则返回可提交的候选公式。",
    ],
    parameters: {
      x: [
        'Input variable names or expressions, e.g., ``["x1", "x2"]``. Defaults to all numeric non-target variables.',
        '输入变量名或表达式，如 ["x1", "x2"]。默认为所有非目标数值变量。',
      ],
      y: [
        'Target variable name or expression, e.g., ``"y"`` or ``"y - x1"``. Defaults to the discovery target.',
        '目标变量名或表达式，如 "y" 或 "y - x1"。默认为发现目标。',
      ],
      poly_degree: [
        "Maximum polynomial degree in the candidate library (1-5, default 3).",
        "候选库的最高多项式次数（1–5，默认 3）。",
      ],
      include_trig: [
        "Whether to append ``sin``/``cos`` Fourier terms to the feature library.",
        "是否向特征库添加 sin 和 cos 傅里叶项。",
      ],
      threshold: [
        "STLSQ coefficient cutoff (0.01-1.0, default 0.1). Larger values yield sparser formulas.",
        "STLSQ 系数阈值（0.01–1.0，默认 0.1）。较大值会产生更稀疏的公式。",
      ],
      max_samples: [
        "Maximum number of rows subsampled for fitting (default 5000).",
        "拟合时子采样的最大行数（默认 5000）。",
      ],
      show_diagnostics: [
        "Whether to include residual diagnostics in the evaluation output.",
        "是否在评估输出中包含残差诊断。",
      ],
    },
  },
  code_executor: {
    description: [
      "Execute a Python snippet in an isolated OS sandbox with the dataset piped via ``stdin``. Use this tool for custom statistical tests, transformations, or exploratory checks not covered by built-in analysis tools: 1. Load the dataset via ``import sys, json; data_dict = json.loads(sys.stdin.read())``. 2. Print concise results with ``print(...)`` (only stdout/stderr are returned). 3. Scientific Python packages (``numpy``, ``scipy``, ``scikit-learn``, ``sympy``, ``pandas``) are pre-installed; filesystem writes outside the sandbox, network access, and subprocesses are blocked.",
      "在隔离的操作系统沙箱中执行 Python 片段，数据集经 stdin 传入。适用于内置分析工具未覆盖的统计检验、变换或探索性检查。用 import sys, json 和 data_dict = json.loads(sys.stdin.read()) 读取数据，用 print(...) 输出简明结果；仅返回标准输出和标准错误。预装 numpy、scipy、scikit-learn、sympy 和 pandas；禁止写入沙箱以外的文件、访问网络或创建子进程。",
    ],
    parameters: {
      program: [
        "Python code to run. Read ``sys.stdin`` as JSON to inspect ``context.data``.",
        "待运行的 Python 代码。可从 sys.stdin 读取 JSON 以检查 context.data。",
      ],
      timeout_seconds: [
        "Wall-clock timeout in seconds (1-120, default 30).",
        "实际时间上限，单位为秒（1–120，默认 30）。",
      ],
      memory_limit_mb: [
        "Maximum address-space memory in MB (64-4096, default 1024).",
        "最大地址空间，单位为 MB（64–4096，默认 1024）。",
      ],
      output_limit_bytes: [
        "Maximum stdout/stderr capture size in bytes (1024-1048576, default 65536).",
        "捕获标准输出和标准错误的最大字节数（1024–1048576，默认 65536）。",
      ],
    },
  },
  configure_variable_roles: {
    description: [
      "List variable descriptions and roles, or apply an explicitly requested role change. Reading is always allowed. Only change roles when the user explicitly asks to select/configure variables; merely asking to build an evaluator is not authorization. Never select variables to improve a validation score. Unused variables remain in context.data on disk for later selection.",
      "列出变量说明和角色，或执行用户明确请求的角色变更。可随时查看。更改角色需要用户明确要求选择或配置变量；仅要求构建评估器不包含此意。不得为了提高验证得分而选择变量。未使用的变量保留在磁盘上的 context.data 中，供今后选择。",
    ],
    parameters: {
      roles: [
        "Omit for read-only inspection. Otherwise map variable names to 'feature', 'target', or 'unused'. Unmentioned roles are preserved; the resulting selection must have exactly one target. Axis coordinates are listed for reference, not assigned model roles.",
        "省略可只读查看。设置时将变量名映射至 feature、target 或 unused，未提及的角色维持原值。更新后必须恰好有一个目标。坐标轴仅供参考，不分配模型角色。",
      ],
      user_request: [
        "For edits, quote the user's explicit role-configuration request verbatim for the audit log; not needed for inspection.",
        "修改角色时，逐字引用用户明确要求变更角色的原话以记入审计日志；只读查看无需填写。",
      ],
    },
  },
  constant_fit: {
    description: [
      "Test nearby integers, simple fractions, and named constants (``pi``, ``e``, ``sqrt(n)``) at each numeric literal in ``eq``. Searches within 5% relative distance of each numeric literal in ``eq`` for integers, rationals (numerator <= 32, denominator <= 12), ``pi``, ``e``, ``sqrt(2)..sqrt(10)``, and their ``±0.5x``, ``±1x``, ``±2x`` multiples. Returns the Pareto front trading off the number of simplified constants against validation R2 (or train R2 when no validation split exists).",
      "对 eq 中的每个数值字面量测试附近的整数、简单分数及具名常数。在相对距离 5% 内搜索整数、有理数（分子 ≤ 32、分母 ≤ 12）、pi、e、sqrt(2) 至 sqrt(10) 及其 ±0.5、±1、±2 倍。返回简化常数个数与验证集 R² 之间的帕累托前沿；无验证集时使用训练集 R²。",
    ],
    parameters: {
      eq: [
        "Formula string containing at least one floating-point or integer literal.",
        "含至少一个浮点或整数字面量的公式字符串。",
      ],
      y: [
        "Target variable or expression to score against. Overrides ``use_eq_as_y`` when set.",
        "评分所用目标变量或表达式；设置后覆盖 use_eq_as_y。",
      ],
      use_eq_as_y: [
        "When ``True`` and ``y`` is omitted, score against the original ``eq`` output instead of ``context.target``.",
        "设为 True 且省略 y 时，根据原始 eq 的输出评分；其余情况下使用指定目标。",
      ],
    },
  },
  create_skill: {
    description: [
      "Create and save a reusable skill (instructions, data-analysis tool, or formula-proposer tool). Synthesizes the current Agent conversation and ``request`` using the configured LLM, determines whether the skill should be instruction-only (``SKILL.md``) or include a sandboxed custom tool (``tool.py``), validates the draft, and registers any new tool.",
      "创建并保存可复用的技能，包括操作指引、数据分析工具或公式提议工具。使用已配置的语言模型综合当前智能体对话和 request，决定仅生成 SKILL.md，还是同时生成沙箱自定义工具 tool.py，然后验证草稿并注册新增工具。",
    ],
    parameters: {
      request: [
        "Clear description of the reusable tactic, workflow, or custom tool to capture.",
        "清楚描述要记录为技能的可复用方法、流程或自定义工具。",
      ],
      force: [
        "Overwrite an existing editable skill's ``SKILL.md`` and ``tool.py`` if ``True``.",
        "设为 True 时，覆盖既有可编辑技能的 SKILL.md 和 tool.py。",
      ],
      history_messages: [
        "Optional number of recent conversation messages to include as context.",
        "作为上下文提供的最近对话消息数，可选。",
      ],
    },
  },
  delegate_subagent: {
    description: [
      "Invoke an independent, context-isolated scientific critic or hypothesis generator. Use this tool when an independent perspective helps: proposing distinct formula families before spending search budget, auditing near-tied candidates for redundancy or overfitting, interpreting structured residuals, or breaking out of a stagnated search. The subagent cannot call tools or mutate state; it returns falsifiable recommendations for the main Agent.",
      "调用拥有独立上下文的科学审阅或假设生成智能体。可在投入搜索预算前提出不同的公式族，审查评分接近的候选是否冗余或过拟合，解释有结构的残差，或协助停滞的搜索。子智能体不能调用工具或更改状态，只向主智能体返回可检验的建议。",
    ],
    parameters: {
      objective: [
        "Specific scientific question or search decision for the subagent to address.",
        "需要子智能体解决的具体科学问题或搜索决策。",
      ],
      mode: [
        'Subagent role: ``"hypothesis_generation"``, ``"candidate_critique"``, ``"residual_diagnosis"``, or ``"search_recovery"``.',
        "子智能体角色，可选 hypothesis_generation（生成假设）、candidate_critique（审阅候选）、residual_diagnosis（残差诊断）或 search_recovery（恢复搜索）。",
      ],
      candidate_formulas: [
        "Optional list of candidate formula strings to audit or compare.",
        "待审查或比较的候选公式字符串列表，可选。",
      ],
      evidence: [
        "Compact summary of fit metrics, residual patterns, domain constraints, or prior attempts.",
        "对拟合指标、残差模式、定义域约束或先前尝试的简明概述。",
      ],
    },
  },
  edit_skill: {
    description: [
      "Update an editable skill's ``SKILL.md`` using exact ``SEARCH/REPLACE`` blocks. Use this tool when concrete evidence from the current run refines or corrects an existing skill. Prefer small, generalizable edits; never hard-code dataset-specific constants or unverified guesses into a reusable skill.",
      "使用精确的 SEARCH/REPLACE 块更新可编辑技能的 SKILL.md。适用于当前运行得到的具体证据可修正或完善已有技能时。修改应简小且可推广；勿将特定数据集的常数或未经验证的猜测写入可复用技能。",
    ],
    parameters: {
      name: [
        "Exact name of the editable skill to modify.",
        "要修改的可编辑技能的完整名称。",
      ],
      patch: [
        "One or more ``<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE`` blocks where each SEARCH section matches ``SKILL.md`` exactly once.",
        "一个或多个 <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE 块，每个 SEARCH 部分须在 SKILL.md 中精确匹配一次。",
      ],
    },
  },
  edit_tool: {
    description: [
      "Patch and reload a custom tool in an editable skill directory. Pass the skill directory name (`name`, not `metadata.name`) and one or more exact SEARCH/REPLACE blocks (`<<<<<<< SEARCH old ======= new >>>>>>> REPLACE`). Each SEARCH block must match once; failed patches leave files untouched. Custom tools must not use `@BaseTool.register(...)`.",
      "修补并重新加载可编辑技能目录中的自定义工具。传入技能目录名 name（不是 metadata.name）以及一个或多个精确替换块，标记依次为 <<<<<<< SEARCH、旧内容、=======、新内容、>>>>>>> REPLACE。每个查找块须恰好匹配一次；失败时文件保持原样。自定义工具不得使用 @BaseTool.register(...)。",
    ],
    parameters: {
      name: [
        "Skill directory name containing ``tool.py`` (not the tool's ``metadata.name``).",
        "含 tool.py 的技能目录名，不是工具的 metadata.name。",
      ],
      tool_patch: [
        "One or more ``<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE`` blocks for ``tool.py``. Each SEARCH block must match exactly once, and the resulting class must not use ``@BaseTool.register(...)``.",
        "用于 tool.py 的一个或多个 <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE 块。每个 SEARCH 块须精确匹配一次，修改后的类不得使用 @BaseTool.register(...)。",
      ],
      skill_patch: [
        "Optional ``SEARCH/REPLACE`` blocks to apply simultaneously to ``SKILL.md``.",
        "同时应用于 SKILL.md 的可选 SEARCH/REPLACE 块。",
      ],
    },
  },
  evaluate_code: {
    description: [
      "Evaluate a Python-defined candidate model on the train and validation splits. Before using this tool, call ``read_skill`` to check ``sr-harness-engine-syntax`` (and ``sr-harness-engine-graph-syntax`` for graph/hypergraph problems). Prefer symbolic formulas in ``evaluate_formula`` whenever SRHarness Engine syntax can express the model; use ``evaluate_code`` only when custom Python logic is genuinely required. Returns a submission-eligible candidate when ``y`` is the default target variable and ``predict_code`` does not depend on ``y``.",
      "在训练集和验证集上评估 Python 定义的候选模型。使用前通过 read_skill 查阅 sr-harness-engine-syntax，图或超图问题还需查阅 sr-harness-engine-graph-syntax。SRHarness Engine 语法可表达模型时优先用 evaluate_formula；确需自定义 Python 逻辑时使用本工具。若 y 为默认目标且 predict_code 不依赖 y，则返回可提交的候选模型。",
    ],
    parameters: {
      model_code: [
        "Python source defining ``def func(data) -> dict`` (plus optional imports) that fits parameters on ``data`` and returns a model dict containing a concise mathematical ``description`` string.",
        "定义 def func(data) -> dict 的 Python 源码，可含导入语句。在 data 上拟合参数，返回的模型字典应包含简明的数学描述字符串 description。",
      ],
      predict_code: [
        "Python source defining ``def func(data, model)`` (plus optional imports) that computes predicted target values without reading the target variable from ``data``.",
        "定义 def func(data, model) 的 Python 源码，可含导入语句。计算目标预测值时不得从 data 读取目标变量。",
      ],
      y: [
        'Target variable name or expression, e.g., ``"y"`` or ``"log(y)"``. Defaults to ``context.target``.',
        '目标变量名或表达式，如 "y" 或 "log(y)"。默认为 context.target。',
      ],
      timeout_seconds: [
        "Sandbox execution timeout in seconds (1-120, default 30).",
        "沙箱执行时间上限，单位为秒（1–120，默认 30）。",
      ],
      memory_limit_mb: [
        "Sandbox memory limit in MB (64-4096, default 1024).",
        "沙箱内存上限，单位为 MB（64–4096，默认 1024）。",
      ],
      output_limit_bytes: [
        "Maximum captured output in bytes (1024-1048576, default 65536).",
        "最大输出捕获字节数（1024–1048576，默认 65536）。",
      ],
      show_diagnostics: [
        "Whether to include residual diagnostics in the evaluation result.",
        "是否在评估结果中包含残差诊断。",
      ],
    },
  },
  evaluate_eic: {
    description: [
      "Evaluate whole-formula and per-subtree Effective Information Criterion (EIC) stability diagnostics. Injects relative Gaussian noise after each non-leaf operator to measure noise amplification and numerical information loss across all subtrees. Lower EIC indicates better numerical stability; high subtree EIC paired with near-zero output impact reveals masked or redundant subtrees.",
      "用有效信息准则（EIC）诊断整条公式和各子树的稳定性。在每个非叶运算符后注入相对高斯噪声，测量子树的噪声放大和数值信息损失。EIC 越低表示数值越稳定；子树 EIC 较高但对输出影响接近零，提示存在被掩盖或冗余的子树。",
    ],
    parameters: {
      f: ["Symbolic formula string to diagnose.", "待诊断的符号公式字符串。"],
      noise_level: [
        "Relative Gaussian noise standard deviation injected after each operator (0 < noise_level < 1, default 0.001).",
        "每个运算符后注入的相对高斯噪声标准差（0 < noise_level < 1，默认 0.001）。",
      ],
      repeats: [
        "Number of Monte Carlo perturbation runs to average (1-100, default 8).",
        "用于求平均的蒙特卡洛扰动次数（1–100，默认 8）。",
      ],
      random_state: [
        "Random seed for reproducible noise injection.",
        "使噪声注入可复现的随机种子。",
      ],
      zero_epsilon: [
        "Positive fallback denominator when a clean subtree output equals zero (default 1e-6).",
        "无噪声的子树输出为零时使用的正数分母（默认 1e-6）。",
      ],
    },
  },
  evaluate_formula: {
    description: [
      "Evaluate how well a symbolic formula ``f`` fits target ``y`` on train and validation splits. Automatically treats unknown variable names in ``f`` as tunable parameters and optimizes them with BFGS. Records a submission-eligible candidate when ``y`` is the default target variable and ``f`` does not reference ``y``.",
      "在训练集和验证集上评估符号公式 f 对目标 y 的拟合效果。将 f 中未知的变量名视为可调参数，用 BFGS 优化。若 y 为默认目标且 f 未引用 y，则记录可提交的候选公式。",
    ],
    parameters: {
      f: [
        'Symbolic formula string, e.g., ``"x1**2 + sin(x2) + 3.5 * tanh(x3)"``. Standard math operators (``sin``, ``sinh``, ``sec``, ``sech``, ``sigmoid``, etc.) are supported directly without ``np.`` prefixes.',
        '符号公式字符串，例如 "x1**2 + sin(x2) + 3.5 * tanh(x3)"。可直接使用 sin、sinh、sec、sech、sigmoid 等标准数学运算，无需 np. 前缀。',
      ],
      y: [
        'Target variable name or expression, e.g., ``"y"``, ``"log(y)"``, or ``"y - x1"``. Defaults to ``context.target``.',
        '目标变量名或表达式，如 "y"、"log(y)"、"y - x1"。默认为 context.target。',
      ],
      fit: [
        "Whether to optimize scalar parameters in ``f`` on the training split via BFGS.",
        "是否在训练集上用 BFGS 优化 f 中的标量参数。",
      ],
      show_diagnostics: [
        "Whether to return residual quantiles, worst samples, and residual-feature correlations.",
        "是否返回残差分位数、误差最大的样本及残差与特征的相关性。",
      ],
    },
  },
  evaluate_observational_formula: {
    description: [
      "Evaluate a regression, count intensity or unnormalized density. Requires an explicitly selected ObservationalEvaluator and a prepared discovery contract. Fits use frozen training observations only. A density may use its measured coordinate; ordinary regression may not use its target as a predictor. Unknown variable names are errors, not parameters.",
      "评估回归、计数强度或未归一化密度。需显式选择 ObservationalEvaluator 并准备发现契约。拟合仅使用已冻结的训练观测。密度模型可使用其测量坐标；普通回归不得将目标用于预测。未知变量名会报错，不会自动作为参数。",
    ],
    parameters: {
      f: [
        "Candidate expression. Use explicit parameters such as param('slope', value=0.0), and fit=true to optimize them.",
        "候选表达式。用 param('slope', value=0.0) 等语法显式声明参数，设 fit=true 以优化。",
      ],
      y: [
        "Declared target name; defaults to the current target.",
        "声明的目标名，默认为当前目标。",
      ],
      fit: [
        "Fit parameters under the declared objective on training rows.",
        "在训练行上根据声明的目标函数拟合参数。",
      ],
      show_diagnostics: [
        "Include regression/count residual diagnostics. Density results instead expose likelihood and normalization.",
        "是否包含回归或计数残差诊断。密度模型结果另行提供似然与归一化信息。",
      ],
    },
  },
  finish_search: {
    description: [
      "Request early termination of the current symbolic-regression search. The harness verifies its completion criteria and either pauses the run or explains why searching must continue.",
      "请求提前结束当前符号回归搜索。系统核对完成条件，据此暂停运行或说明仍需继续搜索的原因。",
    ],
    parameters: {
      reason: [
        "Concise summary of why the current best candidate satisfies the search goal.",
        "简要说明当前最佳候选为何满足搜索目标。",
      ],
    },
  },
  nd2: {
    description: [
      "Run NDformer-guided Monte Carlo Tree Search (ND2) to discover node or edge dynamics on a network. Requires adjacency matrix ``A`` and/or edge list ``G`` in ``context.data``, a 2D target of shape ``(time, node)`` or ``(time, edge)``, and matching node/edge features. ``ND2_HOME`` must point to the ND2 repository and ``ND2_CHECKPOINT`` to ``checkpoint.pth``.",
      "运行 NDformer 引导的蒙特卡洛树搜索（ND2），发现网络的节点或边动力学。context.data 需提供邻接矩阵 A 或边列表 G，或两者兼具；目标须为形状 (time, node) 或 (time, edge) 的二维数组，并有匹配的节点或边特征。ND2_HOME 应指向 ND2 仓库，ND2_CHECKPOINT 应指向 checkpoint.pth。",
    ],
    parameters: {
      vars_node: [
        "Node-level feature names. Inferred from arrays ending in the node dimension when omitted.",
        "节点级特征名。省略时，根据最后一维对应节点维度的数组推断。",
      ],
      vars_edge: [
        "Edge-level feature names. Inferred from arrays ending in the edge dimension when omitted.",
        "边级特征名。省略时，根据最后一维对应边维度的数组推断。",
      ],
      y: [
        "Target variable name. Defaults to ``context.target``.",
        "目标变量名，默认为 context.target。",
      ],
      root_type: [
        'Target level to predict, either ``"node"`` or ``"edge"``.',
        "要预测的目标层级，可选 node（节点）或 edge（边）。",
      ],
      binary_operators: [
        "Allowed ND2 binary operator tokens. Defaults to ``DEFAULT_BINARY``.",
        "允许的 ND2 二元运算符标记，默认为 DEFAULT_BINARY。",
      ],
      unary_operators: [
        "Allowed ND2 unary/graph operator tokens. Defaults to ``DEFAULT_UNARY``.",
        "允许的 ND2 一元或图运算符标记，默认为 DEFAULT_UNARY。",
      ],
      timeout: [
        "Search wall-time limit in seconds (10-3600, default 60).",
        "搜索实际用时上限，单位为秒（10–3600，默认 60）。",
      ],
      episode_limit: [
        "Maximum MCTS episodes (1-1000000, default 10000).",
        "MCTS 的最大轮数（1–1000000，默认 10000）。",
      ],
      beam_size: [
        "Beam width retained per MCTS expansion (1-100, default 10).",
        "每次 MCTS 扩展保留的束宽（1–100，默认 10）。",
      ],
      max_coeff_num: [
        "Maximum number of fitted scalar coefficients (0-20, default 5).",
        "拟合的最大标量系数个数（0–20，默认 5）。",
      ],
    },
  },
  observational_statistics: {
    description: [
      "Summarize the explicitly requested frozen training data view. Requires discovery_contract.json and context.data on disk. This tool is intentionally different from statistics_analysis, which always inspects the current context. Scientific measurement stops may still be audited.",
      "汇总明确指定的冻结训练数据视图。需在磁盘上提供 discovery_contract.json 和 context.data。本工具针对指定训练视图，statistics_analysis 则始终检查当前上下文。仍可审查科学测量的停止条件。",
    ],
    parameters: {
      variables: [
        "Variables or diagnostic expressions using exposed inputs. Defaults to numeric arrays present in the current context.",
        "利用已公开输入构造的变量或诊断表达式，默认为当前上下文中的数值数组。",
      ],
      n_bins: [
        "Number of equal-width histogram bins (1-100).",
        "等宽直方图的分箱数（1–100）。",
      ],
      near_zero_threshold: [
        "Initial absolute threshold for near-zero counts.",
        "近零计数的初始绝对值阈值。",
      ],
    },
  },
  polynomial_fit: {
    description: [
      "Fit a multivariate polynomial up to ``max_degree`` using QR least squares and optional term pruning. Supports custom input expressions, interaction whitelists/blacklists, and conservative pruning of monomials whose RMS and peak contributions are negligible on the training set. Returns a submission-eligible candidate when ``y`` is the default target variable and ``x`` does not depend on ``y``.",
      "用 QR 最小二乘法拟合总次数不超过 max_degree 的多元多项式，可选剪枝。支持自定义输入表达式和交互项允许或排除列表，可保守移除在训练集上均方根贡献及峰值贡献均可忽略的单项式。若 y 为默认目标且 x 不依赖 y，则返回可提交的候选公式。",
    ],
    parameters: {
      x: [
        'Input variable names or expressions, e.g., ``["x1", "sin(x2)"]``. Defaults to all numeric non-target variables.',
        '输入变量名或表达式，如 ["x1", "sin(x2)"]。默认为所有非目标数值变量。',
      ],
      y: [
        'Target variable name or expression, e.g., ``"y"`` or ``"log(y)"``. Defaults to ``context.target``.',
        '目标变量名或表达式，如 "y" 或 "log(y)"。默认为 context.target。',
      ],
      max_degree: [
        "Maximum total degree of polynomial terms (default 2).",
        "多项式项的最高总次数（默认 2）。",
      ],
      include_interactions: [
        "Whether cross-product terms between distinct features are allowed.",
        "是否允许不同特征之间的交叉乘积项。",
      ],
      interaction_blacklist: [
        "Pairs of feature names ``[(u, v), ...]`` excluded from interacting.",
        "禁止交互的特征名对，格式为 [(u, v), ...]。",
      ],
      interaction_whitelist: [
        "If provided, only these feature pairs ``[(u, v), ...]`` are allowed to interact.",
        "若提供，仅允许列表 [(u, v), ...] 中的特征对交互。",
      ],
      include_bias: [
        "Whether to include a constant intercept term.",
        "是否包含常数截距项。",
      ],
      simplify: [
        "Whether to prune negligible monomials and refit the remaining coefficients (default ``True``).",
        "是否剪除贡献可忽略的单项式，并重新拟合其余系数（默认为 True）。",
      ],
      show_diagnostics: [
        "Whether to include residual diagnostics in the evaluation output.",
        "是否在评估输出中包含残差诊断。",
      ],
    },
  },
  power_law_fit: {
    description: [
      "Fit a multiplicative power law ``y = c * prod(x_i ** p_i)`` via log-space least squares. Requires all supplied ``x`` and ``y`` values to be finite and strictly positive on every training sample. Also computes jackknife 95% confidence intervals for each exponent and can snap exponents to nearby simple fractions ``p/q`` when accuracy loss is within tolerance.",
      "用对数空间最小二乘法拟合乘法幂律 y = c * prod(x_i ** p_i)。所有训练样本的 x 和 y 值均须有限且严格为正。用刀切法估计各指数的 95% 置信区间，精度损失在容限内时可将指数近似为邻近的简单分数 p/q。",
    ],
    parameters: {
      x: [
        "Strictly positive input variable names or expressions. Defaults to all numeric non-target variables.",
        "严格为正的输入变量名或表达式，默认为所有非目标数值变量。",
      ],
      y: [
        "Strictly positive target variable name or expression. Defaults to ``context.target``.",
        "严格为正的目标变量名或表达式，默认为 context.target。",
      ],
      include_scale: [
        "Whether to fit the leading multiplicative constant ``c``.",
        "是否拟合前置比例常数 c。",
      ],
      snap_exponents: [
        "Whether to snap fitted exponents to nearby simple rationals and refit ``c``.",
        "是否将拟合指数近似为邻近的简单有理数，并重新拟合 c。",
      ],
      max_denominator: [
        "Maximum rational denominator considered when snapping exponents (1-32, default 8).",
        "近似指数时考虑的最大分母（1–32，默认 8）。",
      ],
      snap_tolerance: [
        "Maximum absolute change allowed per snapped exponent (default 0.05).",
        "每个指数近似时允许的最大绝对变化（默认 0.05）。",
      ],
      max_snap_rmse_degradation: [
        "Maximum normalized RMSE increase allowed after snapping (default 0.01).",
        "指数近似后允许的最大归一化 RMSE 增量（默认 0.01）。",
      ],
      n_stability_folds: [
        "Number of jackknife folds for exponent confidence intervals (2-20, default 5).",
        "估算指数置信区间的刀切法折数（2–20，默认 5）。",
      ],
      show_diagnostics: [
        "Whether to include residual diagnostics in the evaluation output.",
        "是否在评估输出中包含残差诊断。",
      ],
    },
  },
  rational_fit: {
    description: [
      "Fit a rational function ``P(x) / Q(x)`` (with ``Q``'s constant term fixed to ``1``) across degree combinations. Solves the linearized system ``P(x) - y * (Q(x) - 1) ≈ y`` on a training split, ranks ``(numerator_degree, denominator_degree)`` pairs by complexity-penalized holdout RMSE, refits the best degree pair on all finite samples, and checks whether the fitted denominator crosses or approaches zero.",
      "遍历次数组合拟合有理函数 P(x) / Q(x)，将 Q 的常数项固定为 1。在训练划分上求解线性化方程 P(x) - y * (Q(x) - 1) ≈ y，以带复杂度惩罚的留出集 RMSE 对分子、分母的次数组合排序，在全部有限样本上重新拟合最佳组合，并检查拟合分母是否穿过或接近零。",
    ],
    parameters: {
      x: [
        "Input variable names or expressions. Defaults to all numeric non-target variables.",
        "输入变量名或表达式，默认为所有非目标数值变量。",
      ],
      y: [
        "Target variable name or expression. Defaults to ``context.target``.",
        "目标变量名或表达式，默认为 context.target。",
      ],
      numerator_degree: [
        "Maximum total degree of numerator polynomial ``P`` (0-8, default 2).",
        "分子多项式 P 的最高总次数（0–8，默认 2）。",
      ],
      denominator_degree: [
        "Maximum total degree of non-constant denominator polynomial ``Q - 1`` (0-8, default 1).",
        "分母非常数多项式 Q - 1 的最高总次数（0–8，默认 1）。",
      ],
      include_interactions: [
        "Whether cross-product monomials are included in ``P`` and ``Q``.",
        "P 和 Q 中是否包含交叉乘积单项式。",
      ],
      numerator_degrees: [
        "Optional list of numerator degrees to grid-search; overrides ``numerator_degree``.",
        "可选的分子次数网格搜索列表，将覆盖 numerator_degree。",
      ],
      denominator_degrees: [
        "Optional list of denominator degrees to grid-search; overrides ``denominator_degree``.",
        "可选的分母次数网格搜索列表，将覆盖 denominator_degree。",
      ],
      validation_fraction: [
        "Holdout fraction used to score degree pairs (0.05-0.5, default 0.2).",
        "用于评价次数组合的留出样本比例（0.05–0.5，默认 0.2）。",
      ],
      top_k: [
        "Maximum number of simpler Pareto-optimal alternatives to report (1-20, default 5).",
        "最多报告多少个更简单的帕累托最优备选结果（1–20，默认 5）。",
      ],
      complexity_penalty: [
        "Penalty per fitted term added to normalized holdout RMSE (default 1e-12).",
        "每个拟合项在归一化留出集 RMSE 上增加的惩罚（默认 1e-12）。",
      ],
      show_diagnostics: [
        "Whether to include residual diagnostics in the evaluation output.",
        "是否在评估输出中包含残差诊断。",
      ],
    },
  },
  read_pdf: {
    description: [
      "Extract text from a page range of a workspace PDF file or public HTTP(S) PDF URL.",
      "从工作区 PDF 文件或公开 HTTP(S) PDF 链接的指定页范围提取文本。",
    ],
    parameters: {
      source: [
        "Workspace-relative PDF path or an absolute public ``http://`` / ``https://`` URL.",
        "相对于工作区的 PDF 路径或公开的 http://、https:// 绝对地址。",
      ],
      start_page: [
        "1-indexed first page to extract (default 1).",
        "要提取的起始页，从 1 开始计数（默认 1）。",
      ],
      max_pages: [
        "Maximum number of pages to read in one call (1-50, default 10).",
        "每次调用读取的最大页数（1–50，默认 10）。",
      ],
    },
  },
  read_skill: {
    parameters: {
      name: [
        "Exact skill name to read. Leave empty when searching with ``query``.",
        "待读取技能的完整名称。使用 query 搜索时留空。",
      ],
      file_path: [
        'Optional path relative to the skill directory (e.g., ``"tool.py"`` or ``"references/guide.md"``). Reads ``SKILL.md`` when empty.',
        '相对于技能目录的可选路径，如 "tool.py" 或 "references/guide.md"。留空时读取 SKILL.md。',
      ],
      show_tree: [
        "Whether to include a listing of all files in the skill directory.",
        "是否列出技能目录中的所有文件。",
      ],
      query: [
        "Keyword or task description used to rank matching skills when ``name`` is empty.",
        "name 为空时，用于匹配技能并排序的关键词或任务描述。",
      ],
    },
  },
  read_source: {
    description: [
      "List source files, read a file, or look up a Python symbol's definition and references in the installed SRHarness codebase (paths are relative to `src`).",
      "列出已安装 SRHarness 的源码文件，读取文件，或查找 Python 符号的定义与引用；路径相对于 src。",
    ],
    parameters: {
      path: [
        "Optional file or directory path relative to `src`.",
        "相对于 src 的可选文件或目录路径。",
      ],
      symbol: [
        "Optional Python symbol name, e.g. `DefaultEvaluator.evaluate`.",
        "可选的 Python 符号名，如 DefaultEvaluator.evaluate。",
      ],
      include_implementation: [
        "Include matching class/function definitions (default: true).",
        "是否包含匹配的类或函数定义（默认 true）。",
      ],
      include_references: [
        "Include matching symbol usages and imports (default: false).",
        "是否包含匹配符号的用法和导入语句（默认 false）。",
      ],
    },
  },
  relationship_analysis: {
    description: [
      "Analyze how each variable or expression relates to target ``y`` via correlations, binning, and 1D held-out fits. For each candidate feature ``x_i``, computes: - Pearson linear and Spearman rank correlations with ``y``. - Conditional mean, std, and range of ``y`` across quantile or equal-width bins of ``x_i``. - Cross-validated 1D predictive ``R2`` (testing whether ``y ≈ g(x_i)`` collapses onto a single feature/composite) and the strongest remaining variable correlated with the 1D residual.",
      "通过相关性、分箱和一维留出拟合分析各变量或表达式与目标 y 的关系。对每个候选特征 x_i，计算其与 y 的皮尔逊线性相关和斯皮尔曼秩相关；按 x_i 的分位数或等宽区间统计 y 的条件均值、标准差和范围；通过交叉验证的一维预测 R² 检验单个特征或组合能否解释 y ≈ g(x_i)，并找出与一维残差相关性最强的其余变量。",
    ],
    parameters: {
      variables: [
        'Feature names or expressions to analyze, e.g., ``["x1", "x2", "x1 * x2"]``. Defaults to all numeric non-target variables.',
        '要分析的特征名或表达式，如 ["x1", "x2", "x1 * x2"]。默认为所有非目标数值变量。',
      ],
      y: [
        "Target variable name or expression. Defaults to ``context.target``.",
        "目标变量名或表达式，默认为 context.target。",
      ],
      n_bins: [
        "Number of bins for conditional target summaries and bin-mean collapse (2-100, default 5).",
        "汇总条件目标和分箱均值折叠检验的分箱数（2–100，默认 5）。",
      ],
      pairwise: [
        "Whether to also compute full pairwise Pearson and Spearman matrices across all analyzed variables.",
        "是否同时计算所有分析变量之间完整的皮尔逊和斯皮尔曼两两相关矩阵。",
      ],
      binning: [
        'Binning scheme, either ``"quantile"`` (default) or ``"equal_width"``.',
        "分箱方案，可选 quantile（分位数，默认）或 equal_width（等宽）。",
      ],
      n_folds: [
        "Number of cross-validation folds for the 1D held-out collapse test (2-20, default 5).",
        "一维留出折叠检验的交叉验证折数（2–20，默认 5）。",
      ],
      collapse_model: [
        '1D predictor used in cross-validation: ``"bins"`` (default), ``"spline"``, or ``"isotonic"``. Spline diagnostics support at most 5000 distinct training coordinates; use bins or isotonic for larger catalogs.',
        "交叉验证使用的一维预测器，可选 bins（默认）、spline 或 isotonic。样条诊断最多支持 5000 个不同的训练坐标，更大的数据集请使用 bins 或 isotonic。",
      ],
    },
  },
  sr4mdl: {
    description: [
      "Run MDLformer-guided Monte Carlo Tree Search (SR4MDL) for minimum-description-length symbolic discovery. Evaluates input expressions ``x`` and target ``y``, runs MCTS guided by a pretrained MDLformer network, and evaluates the discovered formula on train/validation splits. Requires ``SR4MDL_HOME`` and ``SR4MDL_CHECKPOINT`` to be configured.",
      "运行 MDLformer 引导的蒙特卡洛树搜索（SR4MDL），依据最短描述长度发现符号规律。计算输入表达式 x 和目标 y，使用预训练 MDLformer 引导搜索，再在训练集和验证集上评估所得公式。需要配置 SR4MDL_HOME 和 SR4MDL_CHECKPOINT。",
    ],
    parameters: {
      binary_operators: [
        'Binary operators to search over, chosen from ``["+", "-", "*", "/"]``.',
        '用于搜索的二元运算符，可选 ["+", "-", "*", "/"]。',
      ],
      unary_operators: [
        'Unary operators to search over, chosen from ``["sqrt", "sin", "cos", "neg", "inv", "log", "exp", "square", "cube"]``.',
        '用于搜索的一元运算符，可选 ["sqrt", "sin", "cos", "neg", "inv", "log", "exp", "square", "cube"]。',
      ],
      x: [
        "Input variable names or expressions. Defaults to all numeric non-target variables.",
        "输入变量名或表达式，默认为所有非目标数值变量。",
      ],
      y: [
        "Target variable name or expression. Defaults to ``context.target``.",
        "目标变量名或表达式，默认为 context.target。",
      ],
      timeout: [
        "Soft wall-time budget in seconds (10-600, default 60).",
        "实际时间软上限，单位为秒（10–600，默认 60）。",
      ],
      maxsize: [
        "Maximum expression tree length (5-100, default 30).",
        "表达式树的最大长度（5–100，默认 30）。",
      ],
      max_samples: [
        "Maximum number of samples subsampled for fitting (20-5000, default 500).",
        "拟合时子采样的最大样本数（20–5000，默认 500）。",
      ],
      n_iter: [
        "Maximum MCTS iterations (1-10000, default 100).",
        "MCTS 的最大迭代次数（1–10000，默认 100）。",
      ],
      show_diagnostics: [
        "Whether to include residual diagnostics in the evaluation output.",
        "是否在评估输出中包含残差诊断。",
      ],
    },
  },
  statistics_analysis: {
    description: [
      "Compute summary statistics, domain/sign fractions, near-zero counts, and histograms for variables or expressions.",
      "计算变量或表达式的汇总统计量、定义域及正负值占比、近零样本数和直方图。",
    ],
    parameters: {
      variables: [
        'List of variable names or expressions to analyze, e.g., ``["x1", "x2", "y"]`` or ``["sin(x1)", "(x1-x2)**2"]``. Analyzes all numeric variables (including the target) by default.',
        '要分析的变量名或表达式列表，如 ["x1", "x2", "y"] 或 ["sin(x1)", "(x1-x2)**2"]。默认分析包括目标在内的所有数值变量。',
      ],
      n_bins: [
        "Number of equal-width histogram bins used to summarize each finite distribution (1-100).",
        "各有限值分布的等宽直方图分箱数（1–100）。",
      ],
      near_zero_threshold: [
        "Primary absolute-value cutoff ``|x| <= threshold`` for counting near-zero samples (also reports ``1e-6`` and ``1e-4``).",
        "近零样本计数使用的主绝对值阈值 |x| ≤ threshold，同时报告 1e-6 和 1e-4 两个阈值的结果。",
      ],
    },
  },
  submit_formula: {
    description: [
      "Evaluate and submit a candidate formula for the discovery target. Call this tool whenever you find a strong formula; you may submit multiple times and the harness retains the best candidate. A submission is recorded as a valid candidate only when `y` is the default target variable and `f` does not reference `y`.",
      "评估并提交发现目标的候选公式。找到有力的公式时即可提交，可多次提交，系统保留最佳候选。仅当 y 为默认目标且 f 未引用 y 时，提交才会记为有效候选。",
    ],
    parameters: {
      f: [
        'Symbolic formula string, e.g., ``"x1**2 + sin(x2) + 3.5 * tanh(x3)"``. Standard math operators (``sin``, ``sinh``, ``sec``, ``sech``, ``sigmoid``, etc.) are supported directly without ``np.`` prefixes.',
        '符号公式字符串，例如 "x1**2 + sin(x2) + 3.5 * tanh(x3)"。可直接使用 sin、sinh、sec、sech、sigmoid 等标准数学运算，无需 np. 前缀。',
      ],
      y: [
        'Target variable name or expression, e.g., ``"y"``, ``"log(y)"``, or ``"y - x1"``. Defaults to ``context.target``.',
        '目标变量名或表达式，如 "y"、"log(y)"、"y - x1"。默认为 context.target。',
      ],
      fit: [
        "Whether to optimize scalar parameters in ``f`` on the training split via BFGS.",
        "是否在训练集上用 BFGS 优化 f 中的标量参数。",
      ],
      show_diagnostics: [
        "Whether to return residual quantiles, worst samples, and residual-feature correlations.",
        "是否返回残差分位数、误差最大的样本及残差与特征的相关性。",
      ],
    },
  },
  validate_context_data: {
    description: [
      "Validate a workspace ``context.data`` directory and return actionable repair instructions for any errors. Runs both ``load_context_data`` and ``inspect_context_data`` without mutating the live :class:`AgentContext`. A passing check guarantees that ``InteractiveSession`` can load the dataset cleanly after the current Agent turn.",
      "验证工作区中的 context.data 目录，并给出可操作的错误修复说明。运行 load_context_data 和 inspect_context_data，无需改动当前 AgentContext。检查通过表明 InteractiveSession 可在本轮智能体结束后正常加载数据集。",
    ],
    parameters: {
      path: [
        'Workspace-relative path to the context-data directory (default ``"context.data"``).',
        '相对于工作区的上下文数据目录路径，默认为 "context.data"。',
      ],
    },
  },
  validate_discovery_contract: {
    description: [
      "Validate discovery_contract.json roles, aligned arrays and declared group split. Reads the full context.data on disk so auxiliary metadata need not become predictors. This validates the declared split, not the active evaluator. See prepare-discovery-handoff skill for the schema and stage responsibilities.",
      "检查 discovery_contract.json 中的变量角色、数组对齐及声明的分组划分。读取磁盘上的完整 context.data，辅助元数据无需充当预测变量。检查对象为声明的划分；评估器本身需另行验证。结构和各阶段职责见 prepare-discovery-handoff 技能。",
    ],
    parameters: {},
  },
  validate_evaluator: {
    description: [
      "Load and test a custom evaluator on a formula without mutating the active ``AgentContext``.",
      "加载自定义评估器并使用公式测试，保留当前 AgentContext。",
    ],
    parameters: {
      f: [
        "Symbolic formula string to score with the evaluator.",
        "用评估器评分的符号公式字符串。",
      ],
      evaluator_file: [
        'Optional workspace-relative Python file (e.g., ``"context.evaluator/custom_evaluator.py"``). Tests the currently attached context evaluator when omitted.',
        '相对于工作区的可选 Python 文件，如 "context.evaluator/custom_evaluator.py"。省略时测试当前上下文绑定的评估器。',
      ],
      y: [
        "Optional target variable or expression; defaults to ``context.target``.",
        "可选的目标变量或表达式，默认为 context.target。",
      ],
      fit: [
        "Whether to fit formula parameters on the training split before scoring.",
        "是否在评分前用训练集拟合公式参数。",
      ],
      show_diagnostics: [
        "Whether to include residual diagnostics in the evaluation report.",
        "是否在评估报告中包含残差诊断。",
      ],
    },
  },
  web_fetch: {
    description: [
      "Fetch and extract readable text from a public HTTP or HTTPS webpage URL. Rejects non-public IP addresses, credentials in URLs, and HTTP redirects. If a site blocks automated access (HTTP 401/403/429), returns ``blocked=True`` so you can search for an alternative source instead of retrying.",
      "抓取公开 HTTP 或 HTTPS 网页并提取可读文本。拒绝非公开 IP、含凭据的 URL 和 HTTP 重定向。网站拒绝自动访问（HTTP 401、403、429）时返回 blocked=True，可据此搜索其他来源。",
    ],
    parameters: {
      url: [
        "Absolute public ``http://`` or ``https://`` URL to fetch.",
        "要抓取的公开 http:// 或 https:// 绝对地址。",
      ],
      max_characters: [
        "Maximum number of extracted text characters to return (1000-50000, default 30000).",
        "最多返回的提取文本字符数（1000–50000，默认 30000）。",
      ],
    },
  },
  web_search: {
    description: [
      "Search the public web for scientific literature, documentation, and domain context.",
      "在公开网络上搜索科研文献、文档及相关领域背景。",
    ],
    parameters: {
      query: ["Specific search query string.", "具体的检索字符串。"],
      max_results: [
        "Maximum number of search results to return (1-10, default 5).",
        "最多返回的搜索结果数（1–10，默认 5）。",
      ],
    },
  },
  workspace_code_executor: {
    description: [
      'Execute Python code in an OS sandbox with the active workspace mounted as the working directory. 1. Runs with ``cwd`` set to the workspace root so relative paths (e.g., ``open("data.csv")``, ``np.save("context.data/x.npy", arr)``) read and write workspace files directly. 2. Also receives serialized ``context.data`` on ``sys.stdin`` (optional to read). 3. Scientific Python libraries are available; access outside the workspace, networking, and subprocess creation are blocked.',
      '在操作系统沙箱中执行 Python，以当前工作区根目录为工作目录。可用相对路径直接读写文件，如 open("data.csv") 或 np.save("context.data/x.npy", arr)。可从 sys.stdin 读取序列化的 context.data。提供科学计算库，禁止访问工作区外部、联网或创建子进程。',
    ],
    parameters: {
      program: [
        "Python source code to execute inside the workspace sandbox.",
        "在工作区沙箱中执行的 Python 源码。",
      ],
      timeout_seconds: [
        "Wall-clock timeout in seconds (1-120, default 30).",
        "实际时间上限，单位为秒（1–120，默认 30）。",
      ],
      memory_limit_mb: [
        "Maximum address-space memory in MB (64-4096, default 1024).",
        "最大地址空间，单位为 MB（64–4096，默认 1024）。",
      ],
      output_limit_bytes: [
        "Maximum stdout/stderr capture size in bytes (1024-1048576, default 65536).",
        "捕获标准输出和标准错误的最大字节数（1024–1048576，默认 65536）。",
      ],
    },
  },
  workspace_shell: {
    description: [
      'Run a restricted shell command or ``|`` pipeline inside the workspace directory. Supports ``ls``, ``cat``, ``head``, ``tail``, ``wc``, ``grep``, ``sort``, ``cut``, ``cp``, ``mv``, ``rm``, ``mkdir``, ``gunzip``, ``gzip``, ``unzip``, and ``tar`` (extract only). Common forms include ``ls -laL`` and ``head -n 20`` (or ``head -20``). All paths must stay within the workspace root; shell redirection (``>``, ``<``), chaining (``;``, ``&&``, ``||``), globbing, and unlisted commands are rejected. Call ``read_skill`` with ``"workspace-shell"`` for full flag syntax.',
      "在工作区目录中运行受限的 shell 命令或用 | 连接的管道。支持 ls、cat、head、tail、wc、grep、sort、cut、cp、mv、rm、mkdir、gunzip、gzip、unzip 和 tar（仅解包），例如 ls -laL、head -n 20 或 head -20。路径须位于工作区内；不支持重定向、命令串联、通配符及列表以外的命令。通过 read_skill 读取 workspace-shell 获取完整选项语法。",
    ],
    parameters: {
      command: [
        'Command or ``|``-connected pipeline string, e.g., ``"ls -la"``, ``"cat data.csv | head -n 5"``, or ``"unzip archive.zip -d raw"``.',
        '命令或以 | 相连的管道字符串，如 "ls -la"、"cat data.csv | head -n 5" 或 "unzip archive.zip -d raw"。',
      ],
      output_limit_bytes: [
        "Maximum stdout size in bytes retained per pipeline stage (1024-1048576, default 65536).",
        "管道每一阶段保留的标准输出最大字节数（1024–1048576，默认 65536）。",
      ],
    },
  },
};
tools.submit_observational_formula = tools.evaluate_observational_formula;

const skills: Record<string, Translation> = {
  "discover-symbolic-laws": [
    "Use this skill when solving a symbolic-regression problem from tabular numerical data, especially when direct formula guesses fail, predictive accuracy has not yielded a compact law, or numerical evidence is needed to choose transformations and discovery tools.",
    "适用于根据数值表格进行符号回归，尤其是直接猜测公式未果、预测准确但尚无简洁规律，或需要用数值证据选择变换和发现工具时。",
  ],
  "fit-before-ranking": [
    "Experimental guidance for the symbolic-regression agent comparing noisy observational relations. Preserve conditional information, verify train-only coefficient fitting, and distinguish structural search from validation-driven parameter tuning. Does not select a scientific function family.",
    "面向符号回归智能体比较含噪观测关系的实验性指引。保留条件信息，核实系数仅用训练集拟合，并区分结构搜索与根据验证集调参。本技能不指定科学函数族。",
  ],
  "prepare-discovery-handoff": [
    "Use when handing observational tables or distributions between data preparation, evaluator construction and symbolic regression. Defines executable variable roles and splits, distinguishes metadata from predictors, and prevents switching scientific objectives merely to obtain a good fit.",
    "用于数据准备、评估器构建与符号回归阶段之间交接观测表格或分布。定义可执行的变量角色和数据划分，区分元数据与预测变量，避免仅为提高拟合表现而更换科学目标。",
  ],
  "sr-harness-engine-graph-syntax": [
    "Use this skill before writing, evaluating, or submitting SRHarness Engine formulas for graphs, networks, hypergraphs, node interactions, relation reductions, edge or hyperedge fields, gather operations, or message passing.",
    "编写、评估或提交 SRHarness Engine 的图或网络公式前使用，涵盖超图、节点交互、关系归约、边或超边场、聚集操作和消息传递。",
  ],
  "sr-harness-engine-syntax": [
    "Use this skill before writing, evaluating, or submitting ordinary SRHarness Engine formulas, especially formulas with fitted parameters, categorical grouped parameters, nonlinear functions, broadcasting, or delays.",
    "编写、评估或提交常规 SRHarness Engine 公式前使用，尤其适用于拟合参数、按类别分组的参数、非线性函数、广播或延迟。",
  ],
  "stable-observational-search": [
    "Experimental optional workflow for stable observational candidate comparison. Use only when explicitly requested; small FRB trials reduced extreme normalization scales and search time but did not improve average validation loss, and regression transfer is unproven.",
    "用于稳定比较观测候选的可选实验流程，仅在明确要求时使用。小规模快速射电暴试验中，极端归一化尺度和搜索时间有所下降，但验证损失平均值未改善，能否推广到回归任务尚未证实。",
  ],
  "validate-observational-discovery": [
    "Use when preparing astronomical observations for symbolic regression, discovering empirical relations in noisy parameter tables, or assessing whether a fitted formula is a reproducible physical discovery. Covers measurement provenance, independent validation, compact baselines and observational failure checks without prescribing a target law.",
    "用于为符号回归准备天文观测数据、从含噪参数表中发现经验关系，或评估拟合公式是否构成可复现的物理发现。涵盖测量来源、独立验证、简洁基线和观测失效检查，不预设目标规律。",
  ],
};

function translated(source: string, pair?: Translation) {
  return pair && source.trim().replace(/\s+/g, " ") === pair[0]
    ? pair[1]
    : source;
}

const skillListIntro =
  "Read a skill's instructions (`SKILL.md`), inspect its files, or search available skills.\n\nSkills provide domain workflows, syntax references, and reusable tactics. Call this tool whenever your task matches one of the skill descriptions below.\n\nAvailable skills:\n\n";
function readSkillDescription(source: string) {
  if (!source.startsWith(skillListIntro + "<skills>")) return source;
  // read_skill formats the active skill list as escaped XML. Replace only
  // recognized descriptions, keeping custom entries, IDs and markup intact.
  const list = source
    .slice(skillListIntro.length)
    .replace(
      /(<name>([^<]+)<\/name>\s*<description>\s*)([^<]*?)(\s*<\/description>)/g,
      (_, start, name, text, end) =>
        start + translated(text, skills[name]) + end,
    );
  return (
    "读取技能说明（SKILL.md）、查看技能文件或搜索可用技能。\n\n技能提供领域工作流程、语法参考和可复用的方法。当前任务符合下列某项技能说明时，请调用此工具。\n\n可用技能：\n\n" +
    list
  );
}

export function capabilityDescription(
  item: Capability,
  language: UiLanguage,
): string {
  const supplied =
    language === "en" ? item.description_en : item.description_zh;
  if (supplied) return supplied;
  const source =
    item.description || item.description_en || item.description_zh || "";
  if (language === "en") return source;
  if (item.name === "read_skill") return readSkillDescription(source);
  return translated(source, tools[item.name]?.description ?? skills[item.name]);
}

export function capabilityParameterDescription(
  toolName: string,
  parameterName: string,
  description: string | undefined,
  language: UiLanguage,
): string {
  const source = description || "";
  return language === "zh"
    ? translated(source, tools[toolName]?.parameters?.[parameterName])
    : source;
}
