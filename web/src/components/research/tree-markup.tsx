// Layout and controls ported from the original ASTRAL workbench.
import { LanguageButton } from "../language-button";

// The viewer controller owns these labels after hydration, including in an iframe.
function label(en: string, zh: string) {
  return { "data-tree-en": en, "data-tree-zh": zh, children: zh };
}

function attribute(name: string, en: string, zh: string) {
  return {
    "data-tree-en": en,
    "data-tree-zh": zh,
    "data-tree-attribute": name,
    [name]: zh,
  };
}

export function TreeMarkup() {
  return (
    <>
      <header>
        <h1 {...label("ASTRAL Search Viewer", "ASTRAL 搜索树查看器")} />
        <LanguageButton />
        <button id={"refresh"} {...label("Refresh", "刷新")} />
        <button id={"home"} {...label("Home", "回到根节点")} />
        <span id={"status"} className={"muted"}></span>
        <div
          className={"agent-control"}
          {...attribute("aria-label", "Live agent controls", "智能体实时控制")}
        >
          <input
            id={"guidance"}
            {...attribute(
              "placeholder",
              "Send guidance for the next turn…",
              "发送下一轮的指导意见…",
            )}
          />
          <button id={"send-guidance"} {...label("Send", "发送")} />
          <button id={"pause-agent"} {...label("Pause", "暂停")} />
          <button
            id={"stop-agent"}
            className={"danger"}
            {...label("Stop", "停止")}
          />
          <span
            id={"agent-status"}
            className={"muted"}
            {...label("agent: running", "智能体：运行中")}
          />
        </div>
      </header>
      <main>
        <nav
          id={"run-panel"}
          className={"run-panel"}
          {...attribute("aria-label", "Runs", "运行记录")}
        >
          <div
            className={"run-tabs"}
            role={"tablist"}
            {...attribute("aria-label", "Left panel", "左侧面板")}
          >
            <button
              id={"runs-tab"}
              className={"run-tab active"}
              type={"button"}
              data-run-tab={"runs"}
              {...label("Runs", "运行记录")}
            />
            <button
              id={"controls-tab"}
              className={"run-tab"}
              type={"button"}
              data-run-tab={"controls"}
              {...label("Controls", "显示设置")}
            />
          </div>
          <div id={"runs-panel"} className={"run-tab-panel"}>
            <div id={"run-panel-header"} className={"run-panel-header"}>
              <span className={"run-toggle"}></span>
              <span
                className={"run-panel-title"}
                {...label("Runs", "运行记录")}
              />
            </div>
            <div id={"run-tree"} className={"run-tree"}></div>
          </div>
          <div id={"controls-panel"} className={"run-tab-panel hidden"}>
            <div className={"display-controls"}>
              <div className={"control-actions"}>
                <button
                  id={"layout"}
                  type={"button"}
                  {...label("Auto Layout", "自动布局")}
                />
                <button
                  id={"weak-edges"}
                  type={"button"}
                  {...label("Hide Weak Edges", "隐藏弱连接")}
                />
                <button
                  id={"labels"}
                  type={"button"}
                  {...label("Hide Labels", "隐藏标签")}
                />
              </div>
              <label className={"control-bar"}>
                <span {...label("Node", "节点大小")} />
                <input
                  id={"node-size"}
                  type={"range"}
                  min={"5"}
                  max={"18"}
                  step={"1"}
                  defaultValue={"9"}
                />
                <span id={"node-size-value"} className={"control-value"}>
                  {"9"}
                </span>
              </label>
              <label className={"control-bar"}>
                <span {...label("Gap", "层间距")} />
                <input
                  id={"level-gap"}
                  type={"range"}
                  min={"70"}
                  max={"220"}
                  step={"4"}
                  defaultValue={"118"}
                />
                <span id={"level-gap-value"} className={"control-value"}>
                  {"118"}
                </span>
              </label>
              <label className={"control-bar"}>
                <span {...label("Horiz", "横向缩放")} />
                <input
                  id={"horizontal-scale"}
                  type={"range"}
                  min={"50"}
                  max={"200"}
                  step={"5"}
                  defaultValue={"100"}
                />
                <span id={"horizontal-scale-value"} className={"control-value"}>
                  {"100"}
                </span>
              </label>
              <div className={"color-control"}>
                <label className={"color-control-row"}>
                  <span {...label("Color", "颜色")} />
                  <select
                    id={"color-metric"}
                    {...attribute("aria-label", "Color metric", "着色指标")}
                  >
                    <option value={"r2"}>{"R2"}</option>
                    <option value={"mse"}>{"MSE"}</option>
                    <option value={"rmse"}>{"RMSE"}</option>
                    <option value={"smape"}>{"SMAPE"}</option>
                    <option value={"mape"}>{"MAPE"}</option>
                    <option value={"mae"}>{"MAE"}</option>
                    <option
                      value={"spearman_r"}
                      {...label("Spearman r", "斯皮尔曼相关系数")}
                    />
                    <option
                      value={"pearson_r"}
                      {...label("Pearson r", "皮尔逊相关系数")}
                    />
                  </select>
                </label>
                <div className={"color-control-row"}>
                  <span className={"range-pair"}>
                    <input
                      id={"r2-color-min"}
                      {...attribute(
                        "aria-label",
                        "Color scale minimum",
                        "着色下限",
                      )}
                      type={"range"}
                      min={"0"}
                      max={"1"}
                      step={"0.01"}
                      defaultValue={"0"}
                    />
                    <input
                      id={"r2-color-max"}
                      {...attribute(
                        "aria-label",
                        "Color scale maximum",
                        "着色上限",
                      )}
                      type={"range"}
                      min={"0"}
                      max={"1"}
                      step={"0.01"}
                      defaultValue={"1"}
                    />
                  </span>
                </div>
                <div className={"color-control-row color-input-row"}>
                  <input
                    id={"r2-color-min-value"}
                    className={"range-input"}
                    type={"number"}
                    step={"0.001"}
                    defaultValue={"0"}
                    {...attribute(
                      "aria-label",
                      "Color scale minimum",
                      "着色下限",
                    )}
                  />
                  <span>{"~"}</span>
                  <input
                    id={"r2-color-max-value"}
                    className={"range-input"}
                    type={"number"}
                    step={"0.001"}
                    defaultValue={"1"}
                    {...attribute(
                      "aria-label",
                      "Color scale maximum",
                      "着色上限",
                    )}
                  />
                </div>
              </div>
              <div className={"export-row"}>
                <select
                  id={"export-format"}
                  {...attribute("aria-label", "Export format", "导出格式")}
                >
                  <option value={"png"}>{"PNG"}</option>
                  <option value={"svg"}>{"SVG"}</option>
                  <option value={"pdf"}>{"PDF"}</option>
                </select>
                <button
                  id={"export"}
                  type={"button"}
                  {...label("Export", "导出")}
                />
              </div>
            </div>
          </div>
        </nav>
        <div
          id={"run-resizer"}
          className={"run-resizer"}
          {...attribute(
            "title",
            "Drag to resize runs panel",
            "拖动以调整运行记录面板大小",
          )}
        >
          <div className={"run-resizer-tabs"}>
            <button
              className={"run-resizer-tab active"}
              type={"button"}
              data-run-tab={"runs"}
              {...label("Runs", "运行记录")}
            />
            <button
              className={"run-resizer-tab"}
              type={"button"}
              data-run-tab={"controls"}
              {...label("Controls", "显示设置")}
            />
          </div>
        </div>
        <section id={"graph-wrap"}>
          <div id={"legend"} className={"legend"}>
            <strong id={"legend-title"}>
              <span className={"legend-toggle"}></span>
              <span {...label("Legend", "图例")} />
            </strong>
            <div className={"legend-body"}>
              <div className={"legend-row"}>
                <span className={"sample node-dot"}></span>
                <span
                  {...label(
                    "Node: one sampled step (R, C, L, K) in the search tree.",
                    "节点：搜索树中的一个采样步骤（R、C、L、K）。",
                  )}
                />
              </div>
              <div className={"legend-row"}>
                <span className={"sample line"}></span>
                <span
                  {...label(
                    "Solid edge: primary conversation continuation.",
                    "实线：主对话的延续。",
                  )}
                />
              </div>
              <div className={"legend-row"}>
                <span className={"sample line weak"}></span>
                <span
                  {...label(
                    "Dashed edge: shared tool outputs from a sibling sample.",
                    "虚线：兄弟采样节点共享的工具输出。",
                  )}
                />
              </div>
              <div className={"legend-row"}>
                <span></span>
                <span
                  {...label(
                    "Color: node score mapped from red (worse) to green (better) on the selected metric.",
                    "颜色：按所选指标的节点得分从红色（较差）到绿色（较好）渐变。",
                  )}
                />
              </div>
            </div>
          </div>
          <svg
            id={"graph"}
            width={1200}
            height={760}
            role={"img"}
            {...attribute("aria-label", "Search graph", "搜索树图")}
          ></svg>
        </section>
        <div
          id={"side-resizer"}
          className={"side-resizer"}
          {...attribute(
            "title",
            "Drag to resize details panel",
            "拖动以调整详情面板大小",
          )}
        ></div>
        <aside>
          <section className={"side-section"}>
            <strong
              id={"node-title"}
              {...label("No node selected", "尚未选择节点")}
            />
            <div id={"node-subtitle"} className={"muted"}></div>
            <div id={"metrics"} className={"metric-grid"}></div>
          </section>
          <section className={"side-section"}>
            <strong {...label("Formula", "公式")} />
            <div
              id={"formula-latex"}
              className={"formula-box muted"}
              {...label("(no candidate formula)", "（暂无候选公式）")}
            />
            <button
              id={"formula-editor-toggle"}
              className={"formula-editor-toggle"}
              type={"button"}
              {...label("LaTeX editor", "LaTeX 编辑器")}
            />
            <div id={"formula-editor"} className={"formula-editor hidden"}>
              <div className={"formula-editor-actions"}>
                <span id={"formula-editor-status"} className={"muted"}></span>
                <button
                  id={"copy-latex"}
                  type={"button"}
                  {...label("Copy", "复制")}
                />
              </div>
              <textarea
                id={"latex-source"}
                spellCheck={"false"}
                {...attribute("aria-label", "LaTeX source", "LaTeX 源码")}
                defaultValue={""}
              ></textarea>
            </div>
            <pre id={"formula-code"} className={"formula-code"}></pre>
          </section>
          <section className={"side-section"}>
            <strong {...label("Preview", "预览")} />
            <div id={"preview"} className={"preview-chat muted"}></div>
          </section>
          <section className={"side-section"}>
            <strong {...label("Tool Call", "工具调用")} />
            <div id={"tool-call"} className={"tool-grid"}></div>
          </section>
          <section className={"side-section"}>
            <strong {...label("Detail", "详情")} />
            <div id={"detail"} className={"json-viewer muted"}></div>
          </section>
        </aside>
      </main>
      <dialog id="tree-command-dialog" aria-labelledby="tree-command-question">
        <form method="dialog">
          <label id="tree-command-question" htmlFor="tree-command-answer" />
          <input id="tree-command-answer" autoComplete="off" />
          <div className="tree-dialog-actions">
            <button
              type="submit"
              value="confirm"
              {...label("Confirm", "确认")}
            />
            <button type="submit" value="cancel" {...label("Cancel", "取消")} />
          </div>
        </form>
      </dialog>
    </>
  );
}
