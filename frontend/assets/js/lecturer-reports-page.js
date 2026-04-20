
    let lastBatchReport = null;
    let lastAiReport = null;
    let studentPerformanceChart = null;
    let modulePerformanceChart = null;
    let aiCriteriaChart = null;
    let aiAgreementChart = null;
    let currentLecturerName = "Lecturer";

    const REPORT_ORGANIZATION = {
      university: "University of Peradeniya",
      facultyDepartment: "Faculty of Dental Sciences",
      system: "DentaNet LMS"
    };

    function switchReportTab(tab) {
      const batchTab = document.getElementById("batchTab");
      const apiTab = document.getElementById("apiTab");
      const batchContent = document.getElementById("batchContent");
      const apiContent = document.getElementById("apiContent");

      if (tab === "batch") {
        batchTab.classList.add("text-primary", "border-primary");
        batchTab.classList.remove("text-slate-500", "dark:text-slate-400", "border-transparent");
        apiTab.classList.remove("text-primary", "border-primary");
        apiTab.classList.add("text-slate-500", "dark:text-slate-400", "border-transparent");
        batchContent.classList.remove("hidden");
        apiContent.classList.add("hidden");
      } else {
        apiTab.classList.add("text-primary", "border-primary");
        apiTab.classList.remove("text-slate-500", "dark:text-slate-400", "border-transparent");
        batchTab.classList.remove("text-primary", "border-primary");
        batchTab.classList.add("text-slate-500", "dark:text-slate-400", "border-transparent");
        apiContent.classList.remove("hidden");
        batchContent.classList.add("hidden");
      }
    }

    function toNum(v) {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function formatDateOnly(value) {
      if (!value) return "-";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }

    function formatDateRange(startDate, endDate) {
      if (!startDate && !endDate) return "All dates";
      if (startDate && endDate) return `${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`;
      if (startDate) return `From ${formatDateOnly(startDate)}`;
      return `Until ${formatDateOnly(endDate)}`;
    }

    function formatAttemptMode(value) {
      const mode = String(value || "last").toLowerCase();
      const map = {
        last: "Last Attempt",
        best: "Best Attempt",
        first: "First Attempt",
        all: "All Attempts"
      };
      return map[mode] || "Last Attempt";
    }

    function getModuleSelectionInfo(selectId, report) {
      const filters = report?.filters || {};
      const selectedModuleId = filters.module_id == null || filters.module_id === ""
        ? ""
        : String(filters.module_id);

      if (!selectedModuleId) {
        return {
          moduleIdLabel: "All",
          moduleNameLabel: "All Assigned Modules"
        };
      }

      const modules = Array.isArray(report?.modules) ? report.modules : [];
      const moduleFromReport = modules.find((module) => String(module.module_id) === selectedModuleId);
      if (moduleFromReport) {
        return {
          moduleIdLabel: selectedModuleId,
          moduleNameLabel: `${moduleFromReport.module_code || "Module"} - ${moduleFromReport.module_name || selectedModuleId}`
        };
      }

      const select = document.getElementById(selectId);
      if (select) {
        const option = Array.from(select.options).find((opt) => String(opt.value) === selectedModuleId);
        if (option) {
          return {
            moduleIdLabel: selectedModuleId,
            moduleNameLabel: option.textContent || `Module ${selectedModuleId}`
          };
        }
      }

      return {
        moduleIdLabel: selectedModuleId,
        moduleNameLabel: `Module ${selectedModuleId}`
      };
    }

    function buildReportHeaderPairs({ report, reportType }) {
      const filters = report?.filters || {};
      const moduleInfo = getModuleSelectionInfo(reportType === "batch" ? "batchModuleId" : "apiModuleId", report);
      const generatedAtValue = report?.generated_at ? new Date(report.generated_at) : new Date();
      const generatedAtLabel = Number.isNaN(generatedAtValue.getTime())
        ? String(report?.generated_at || "-")
        : generatedAtValue.toLocaleString("en-US");

      const pairs = [
        ["University", REPORT_ORGANIZATION.university],
        ["Faculty / Department", REPORT_ORGANIZATION.facultyDepartment],
        ["System", REPORT_ORGANIZATION.system],
        ["Module", moduleInfo.moduleNameLabel],
        ["Module ID", moduleInfo.moduleIdLabel],
        ["Batch Year", filters.batch_year || "All"],
        ["Attempt Mode", formatAttemptMode(filters.attempt_mode)],
        ["Date Range", formatDateRange(filters.start_date, filters.end_date)],
        ["Prepared By", currentLecturerName || "Lecturer"],
        ["Generated At", generatedAtLabel]
      ];

      if (reportType === "ai") {
        pairs.splice(7, 0, ["Tolerance", `${toNum(filters.tolerance || 5).toFixed(2)} points`]);
      }

      return pairs;
    }

    function toCsvCell(value) {
      const val = value == null ? "" : String(value);
      return `"${val.replace(/"/g, '""')}"`;
    }

    function renderSummaryCards(containerId, pairs) {
      const container = document.getElementById(containerId);
      container.innerHTML = pairs.map(([label, value], index) => `
        <article class="metric-card">
          <div class="flex items-start justify-between gap-3">
            <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">${label}</p>
            <span class="material-symbols-outlined text-primary/80 text-[18px]">${["insights", "group", "verified", "monitoring"][index % 4]}</span>
          </div>
          <p class="text-2xl font-extrabold text-slate-900 dark:text-white mt-2">${value}</p>
        </article>
      `).join("");
    }

    function collectBatchFilters() {
      return {
        module_id: document.getElementById("batchModuleId").value,
        batch_year: document.getElementById("batchYear").value,
        start_date: document.getElementById("batchStartDate").value,
        end_date: document.getElementById("batchEndDate").value,
        attempt_mode: document.getElementById("batchAttemptMode").value
      };
    }

    function collectAiFilters() {
      return {
        module_id: document.getElementById("apiModuleId").value,
        batch_year: document.getElementById("apiBatchYear").value,
        start_date: document.getElementById("apiStartDate").value,
        end_date: document.getElementById("apiEndDate").value,
        attempt_mode: document.getElementById("apiAttemptMode").value,
        tolerance: document.getElementById("apiTolerance").value
      };
    }

    function renderBatchReport(report) {
      const summary = report?.summary || {};
      renderSummaryCards("batchSummaryCards", [
        ["Records", toNum(summary.total_records)],
        ["Students", toNum(summary.total_students)],
        ["Pass Rate", `${toNum(summary.pass_rate).toFixed(2)}%`],
        ["Avg Grade", toNum(summary.average_grade).toFixed(2)]
      ]);
      renderBatchCharts(report);

      const body = document.getElementById("batchResultsTableBody");
      const rows = Array.isArray(report?.students) ? report.students : [];
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="7" class="py-4 text-slate-500">No records found for selected filters.</td></tr>`;
        return;
      }

      body.innerHTML = rows.map((row) => `
        <tr class="border-t border-slate-100 dark:border-slate-700">
          <td class="py-2 pr-4 font-semibold">${escapeHtml(row.student_name || "-")}</td>
          <td class="py-2 pr-4">${escapeHtml(row.registration_number || "-")}</td>
          <td class="py-2 pr-4">${escapeHtml(row.batch_year || "-")}</td>
          <td class="py-2 pr-4">${toNum(row.average_grade).toFixed(2)}</td>
          <td class="py-2 pr-4">${row.best_grade == null ? "-" : toNum(row.best_grade).toFixed(2)}</td>
          <td class="py-2 pr-4">${toNum(row.pass_count)}</td>
          <td class="py-2 pr-4">${toNum(row.fail_count)}</td>
        </tr>
      `).join("");
    }

    function destroyChart(instance) {
      if (instance && typeof instance.destroy === "function") {
        instance.destroy();
      }
    }

    function renderBatchCharts(report) {
      if (typeof Chart !== "function") return;

      const students = Array.isArray(report?.students) ? report.students : [];
      const modules = Array.isArray(report?.modules) ? report.modules : [];

      const topStudents = [...students]
        .sort((a, b) => toNum(b.average_grade) - toNum(a.average_grade))
        .slice(0, 8);

      const studentLabels = topStudents.map((s) => (s.registration_number || s.student_name || "Student"));
      const studentData = topStudents.map((s) => toNum(s.average_grade));

      const moduleLabels = modules.map((m) => m.module_code || m.module_name || "Module");
      const modulePassRateData = modules.map((m) => toNum(m.pass_rate));
      const moduleFailRateData = modules.map((m) => Math.max(0, 100 - toNum(m.pass_rate)));

      const studentCtx = document.getElementById("studentPerformanceChart");
      const moduleCtx = document.getElementById("modulePerformanceChart");
      if (!studentCtx || !moduleCtx) return;

      destroyChart(studentPerformanceChart);
      destroyChart(modulePerformanceChart);

      studentPerformanceChart = new Chart(studentCtx, {
        type: "bar",
        data: {
          labels: studentLabels.length ? studentLabels : ["No data"],
          datasets: [{
            label: "Average Grade (Ranked)",
            data: studentData.length ? studentData : [0],
            borderWidth: 1,
            borderRadius: 8,
            backgroundColor: "rgba(59,130,246,0.72)",
            borderColor: "rgba(37,99,235,1)"
          }]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              beginAtZero: true,
              suggestedMax: 100,
              ticks: { color: "#64748b", maxRotation: 0, minRotation: 0 },
              grid: { color: "rgba(148,163,184,0.22)" }
            },
            y: {
              ticks: { color: "#64748b" },
              grid: { display: false }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#0f172a",
              titleColor: "#fff",
              bodyColor: "#e2e8f0",
              padding: 10
            }
          }
        }
      });

      modulePerformanceChart = new Chart(moduleCtx, {
        type: "bar",
        data: {
          labels: moduleLabels.length ? moduleLabels : ["No data"],
          datasets: [
            {
              label: "Pass %",
              data: modulePassRateData.length ? modulePassRateData : [0],
              borderWidth: 1,
              borderRadius: 6,
              backgroundColor: "rgba(16,185,129,0.72)",
              borderColor: "rgba(5,150,105,1)"
            },
            {
              label: "Fail %",
              data: moduleFailRateData.length ? moduleFailRateData : [0],
              borderWidth: 1,
              borderRadius: 6,
              backgroundColor: "rgba(239,68,68,0.72)",
              borderColor: "rgba(220,38,38,1)"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              stacked: true,
              ticks: { color: "#64748b", maxRotation: 0, minRotation: 0 },
              grid: { display: false }
            },
            y: {
              stacked: true,
              beginAtZero: true,
              suggestedMax: 100,
              ticks: { color: "#64748b" },
              grid: { color: "rgba(148,163,184,0.22)" }
            }
          },
          plugins: {
            legend: {
              labels: { color: "#64748b" }
            },
            tooltip: {
              backgroundColor: "#0f172a",
              titleColor: "#fff",
              bodyColor: "#e2e8f0",
              padding: 10
            }
          }
        }
      });
    }

    function renderAiReport(report) {
      const summary = report?.summary || {};
      renderSummaryCards("apiSummaryCards", [
        ["Samples", toNum(summary.sample_count)],
        ["MAE", toNum(summary.mae).toFixed(2)],
        ["RMSE", toNum(summary.rmse).toFixed(2)],
        ["Within Tol.", `${toNum(summary.within_tolerance_rate).toFixed(2)}%`]
      ]);

      const criteria = Array.isArray(report?.criteria) ? report.criteria : [];
      const criteriaContainer = document.getElementById("criteriaContainer");
      criteriaContainer.innerHTML = criteria.length
        ? criteria.map((item) => `
          <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/70 dark:bg-slate-900/30">
            <div class="flex items-center justify-between">
              <p class="font-semibold capitalize">${(item.key || "").replaceAll("_", " ")}</p>
              <p class="text-sm text-slate-500">${toNum(item.acceptable_count)}/${toNum(item.total)}</p>
            </div>
            <div class="mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div class="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500" style="width:${Math.max(0, Math.min(100, toNum(item.acceptable_rate)))}%"></div>
            </div>
            <p class="text-sm text-primary font-bold mt-1">${toNum(item.acceptable_rate).toFixed(2)}% acceptable</p>
          </div>
        `).join("")
        : `<p class="text-slate-500 text-sm">No criteria data available.</p>`;

      const outliers = Array.isArray(report?.outliers) ? report.outliers : [];
      const outliersBody = document.getElementById("outliersTableBody");
      outliersBody.innerHTML = outliers.length
        ? outliers.map((row) => `
          <tr class="border-t border-slate-100 dark:border-slate-700">
            <td class="py-2 pr-4">${escapeHtml(row.student_name || "-")}</td>
            <td class="py-2 pr-4">${escapeHtml(row.exam_name || "-")}</td>
            <td class="py-2 pr-4">${toNum(row.api_score).toFixed(2)}</td>
            <td class="py-2 pr-4">${toNum(row.lecturer_grade).toFixed(2)}</td>
            <td class="py-2 pr-4 font-semibold">${toNum(row.score_diff).toFixed(2)}</td>
          </tr>
        `).join("")
        : `<tr><td colspan="5" class="py-4 text-slate-500">No variance data available.</td></tr>`;

      renderAiCharts(report);
    }

    function renderAiCharts(report) {
      if (typeof Chart !== "function") return;

      const criteria = Array.isArray(report?.criteria) ? report.criteria : [];
      const criteriaLabels = criteria.map((c) => (c.key || "").replaceAll("_", " "));
      const criteriaValues = criteria.map((c) => toNum(c.acceptable_rate));

      const criteriaCtx = document.getElementById("aiCriteriaChart");
      const agreementCtx = document.getElementById("aiAgreementChart");
      if (!criteriaCtx || !agreementCtx) return;

      destroyChart(aiCriteriaChart);
      aiCriteriaChart = new Chart(criteriaCtx, {
        type: "bar",
        data: {
          labels: criteriaLabels,
          datasets: [{
            label: "Acceptable Rate %",
            data: criteriaValues,
            borderWidth: 1,
            borderRadius: 8,
            backgroundColor: "rgba(59,130,246,0.75)",
            borderColor: "rgba(37,99,235,1)"
          }]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              beginAtZero: true,
              suggestedMax: 100,
              ticks: { color: "#64748b" },
              grid: { color: "rgba(148,163,184,0.22)" }
            },
            y: {
              ticks: { color: "#64748b" },
              grid: { display: false }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });

      const outliers = Array.isArray(report?.outliers) ? report.outliers : [];
      const outlierLabels = outliers.map((o, idx) => o.registration_number || `Case ${idx + 1}`);
      const gapValues = outliers.map((o) => Math.abs(toNum(o.score_diff)));

      destroyChart(aiAgreementChart);
      aiAgreementChart = new Chart(agreementCtx, {
        type: "bar",
        data: {
          labels: outlierLabels,
          datasets: [{
            label: "Absolute Score Gap",
            data: gapValues,
            borderWidth: 1,
            borderRadius: 8,
            backgroundColor: "rgba(239,68,68,0.72)",
            borderColor: "rgba(220,38,38,1)"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              ticks: { color: "#64748b", maxRotation: 45, minRotation: 45 },
              grid: { display: false }
            },
            y: {
              beginAtZero: true,
              ticks: { color: "#64748b" },
              grid: { color: "rgba(148,163,184,0.22)" }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });

    }

    function exportCsv(filename, rows, options = {}) {
      if (!rows.length) {
        showWarningNotification("No data available to export.");
        return;
      }

      const headers = Object.keys(rows[0]);
      const title = options.title || "Report";
      const metadataPairs = Array.isArray(options.metadataPairs) ? options.metadataPairs : [];
      const metadataRows = [
        [title],
        ...metadataPairs.map(([label, value]) => [label, value]),
        []
      ];
      const tableRows = [
        headers,
        ...rows.map((row) => headers.map((key) => row[key]))
      ];
      const csvContent = [...metadataRows, ...tableRows]
        .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
        .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    function openPrintReport({
      title,
      subtitle,
      summaryPairs,
      headers,
      rows,
      chartBlocks = [],
      metadataPairs = []
    }) {
      const logoUrl = new URL("blue-logo.svg", window.location.href).href;
      const summaryHtml = summaryPairs.map(([label, value]) =>
        `<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px"><div style="font-size:12px;color:#64748b">${escapeHtml(label)}</div><div style="font-size:20px;font-weight:700;margin-top:4px">${escapeHtml(value)}</div></div>`
      ).join("");
      const chartsHtml = chartBlocks
        .filter((block) => block && block.imageData)
        .map((block) => `
          <div style="margin:16px 0">
            <h3 style="margin:0 0 8px;font-size:16px">${escapeHtml(block.title || "Chart")}</h3>
            <img src="${escapeHtml(block.imageData)}" alt="${escapeHtml(block.title || "Chart")}" style="max-width:100%;border:1px solid #e2e8f0;border-radius:8px" />
          </div>
        `)
        .join("");
      const metadataHtml = metadataPairs.map(([label, value]) => `
        <tr>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;color:#334155;width:220px">${escapeHtml(label)}</th>
          <td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#0f172a">${escapeHtml(value)}</td>
        </tr>
      `).join("");

      const headHtml = headers.map((h) => `<th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(h)}</th>`).join("");
      const rowHtml = rows.map((row) => `<tr>${row.map((cell) => `<td style="padding:8px;border-bottom:1px solid #f1f5f9">${escapeHtml(cell ?? "-")}</td>`).join("")}</tr>`).join("");
      const emptyRowHtml = `<tr><td colspan="${headers.length}" style="padding:8px">No records.</td></tr>`;
      const tableBodyHtml = rowHtml || emptyRowHtml;

      const win = window.open("", "_blank");
      if (!win) {
        showWarningNotification("Popup blocked. Please allow popups to download report.");
        return;
      }

      const printHtml = `
        <html>
          <head>
            <title>${escapeHtml(title)}</title>
            <style>
              body{font-family:Inter,Arial,sans-serif;padding:24px;color:#0f172a}
              h1{margin:0 0 6px;font-size:24px}
              p{margin:0 0 16px;color:#475569}
              .summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}
              table{width:100%;border-collapse:collapse;font-size:13px}
              .doc-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border:1px solid #dbeafe;background:linear-gradient(135deg,#eff6ff,#f8fafc);padding:14px 16px;border-radius:12px}
              .doc-brand{display:flex;gap:12px;align-items:flex-start}
              .doc-brand img{height:52px;width:auto}
              .doc-university{font-size:18px;font-weight:800;color:#1e3a8a;margin:0}
              .doc-subline{margin:2px 0;color:#334155;font-size:12px}
              .meta-wrap{margin:16px 0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
              .meta-wrap table{font-size:12px}
              @media print { body{padding:14px} }
            </style>
          </head>
          <body>
            <div class="doc-head">
              <div class="doc-brand">
                <img src="${escapeHtml(logoUrl)}" alt="DentaNet Logo" onerror="this.style.display='none'" />
                <div>
                  <p class="doc-university">${escapeHtml(REPORT_ORGANIZATION.university)}</p>
                  <p class="doc-subline">${escapeHtml(REPORT_ORGANIZATION.facultyDepartment)}</p>
                  <p class="doc-subline">${escapeHtml(REPORT_ORGANIZATION.system)}</p>
                </div>
              </div>
              <div style="text-align:right">
                <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b">Official Report</p>
                <p style="margin:4px 0 0;font-size:12px;color:#334155">Generated document</p>
              </div>
            </div>
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(subtitle)}</p>
            <div class="meta-wrap">
              <table>
                <tbody>${metadataHtml}</tbody>
              </table>
            </div>
            <div class="summary">${summaryHtml}</div>
            ${chartsHtml}
            <table>
              <thead><tr>${headHtml}</tr></thead>
              <tbody>${tableBodyHtml}</tbody>
            </table>
          </body>
        </html>
      `;
      win.document.open();
      win.document.write(printHtml);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 350);
    }

    async function loadModulesIntoFilters() {
      const selects = [document.getElementById("batchModuleId"), document.getElementById("apiModuleId")]
        .filter(Boolean);
      if (!selects.length) return;

      try {
        const result = await API.modules.getAll();
        const modules = result.ok
          ? (Array.isArray(result.modules) ? result.modules : (Array.isArray(result.data) ? result.data : []))
          : [];

        selects.forEach((select) => {
          select.innerHTML = `<option value="">All Assigned Modules</option>`;
          modules.forEach((module) => {
            const option = document.createElement("option");
            option.value = module.module_id;
            option.textContent = `${module.module_code} - ${module.module_name}`;
            select.appendChild(option);
          });
        });
      } catch (error) {
        console.error("Load modules failed:", error);
        showErrorNotification("Unable to load modules. Please refresh and try again.");
      }
    }

    async function onBatchGenerate(event, options = {}) {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }

      const { silentSuccess = false } = options;
      const filters = collectBatchFilters();
      const btn = document.getElementById("batchGenerateBtn");
      btn.disabled = true;
      btn.textContent = "Generating...";

      try {
        const result = await API.submissions.getLecturerBatchPerformanceReport(filters);
        if (!result.ok) {
          showErrorNotification(result.error || "Failed to generate batch performance report.");
          return;
        }

        lastBatchReport = result;
        renderBatchReport(result);
        if (!silentSuccess) {
          showSuccessNotification("Batch performance report generated.");
        }
      } catch (error) {
        console.error("Batch report generation failed:", error);
        showErrorNotification("Failed to generate batch performance report.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Generate";
      }
    }

    async function onAiGenerate(event) {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      const filters = collectAiFilters();
      const btn = document.getElementById("apiGenerateBtn");
      btn.disabled = true;
      btn.textContent = "Generating...";

      try {
        const result = await API.submissions.getLecturerAiAccuracyReport(filters);
        if (!result.ok) {
          showErrorNotification(result.error || "Failed to generate AI accuracy report.");
          return;
        }

        lastAiReport = result;
        renderAiReport(result);
        showSuccessNotification("AI accuracy report generated.");
      } catch (error) {
        console.error("AI accuracy report generation failed:", error);
        showErrorNotification("Failed to generate AI accuracy report.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Generate";
      }
    }

    function bindReportUiHandlers() {
      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn) logoutBtn.addEventListener("click", () => API.auth.logout());

      const batchTab = document.getElementById("batchTab");
      const apiTab = document.getElementById("apiTab");
      const batchForm = document.getElementById("batchReportForm");
      const apiForm = document.getElementById("apiReportForm");
      const batchExportCsvBtn = document.getElementById("batchExportCsvBtn");
      const apiExportCsvBtn = document.getElementById("apiExportCsvBtn");
      const batchDownloadPdfBtn = document.getElementById("batchDownloadPdfBtn");
      const apiDownloadPdfBtn = document.getElementById("apiDownloadPdfBtn");

      if (batchTab) batchTab.addEventListener("click", () => switchReportTab("batch"));
      if (apiTab) apiTab.addEventListener("click", () => switchReportTab("api"));
      if (batchForm) batchForm.addEventListener("submit", onBatchGenerate);
      if (apiForm) apiForm.addEventListener("submit", onAiGenerate);

      if (batchExportCsvBtn) batchExportCsvBtn.addEventListener("click", () => {
        const report = lastBatchReport;
        const rows = (lastBatchReport?.students || []).map((s) => ({
          student_name: s.student_name,
          registration_number: s.registration_number,
          batch_year: s.batch_year,
          submissions: s.submissions,
          average_grade: s.average_grade,
          best_grade: s.best_grade,
          latest_grade: s.latest_grade,
          pass_count: s.pass_count,
          fail_count: s.fail_count
        }));
        exportCsv("batch-performance-report.csv", rows, {
          title: "Batch Performance Report",
          metadataPairs: buildReportHeaderPairs({ report, reportType: "batch" })
        });
      });

      if (apiExportCsvBtn) apiExportCsvBtn.addEventListener("click", () => {
        const report = lastAiReport;
        const rows = (lastAiReport?.outliers || []).map((o) => ({
          submission_id: o.submission_id,
          student_name: o.student_name,
          registration_number: o.registration_number,
          exam_name: o.exam_name,
          module_code: o.module_code,
          api_score: o.api_score,
          lecturer_grade: o.lecturer_grade,
          score_diff: o.score_diff,
          abs_diff: o.abs_diff
        }));
        exportCsv("ai-accuracy-report.csv", rows, {
          title: "AI Accuracy Report",
          metadataPairs: buildReportHeaderPairs({ report, reportType: "ai" })
        });
      });

      if (batchDownloadPdfBtn) batchDownloadPdfBtn.addEventListener("click", () => {
        const report = lastBatchReport;
        if (!report || !report.summary) {
          showWarningNotification("Generate the batch report first.");
          return;
        }

        const summary = report.summary || {};
        const rows = (report.students || []).map((s) => [
          s.student_name || "-",
          s.registration_number || "-",
          s.batch_year || "-",
          toNum(s.average_grade).toFixed(2),
          s.best_grade == null ? "-" : toNum(s.best_grade).toFixed(2),
          toNum(s.pass_count),
          toNum(s.fail_count)
        ]);

        openPrintReport({
          title: "Student Performance Report",
          subtitle: "Based on final published exam results (lecturer access only).",
          metadataPairs: buildReportHeaderPairs({ report, reportType: "batch" }),
          summaryPairs: [
            ["Records", toNum(summary.total_records)],
            ["Students", toNum(summary.total_students)],
            ["Pass Rate", `${toNum(summary.pass_rate).toFixed(2)}%`],
            ["Average Grade", toNum(summary.average_grade).toFixed(2)]
          ],
          chartBlocks: [
            {
              title: "Top Students (Average Grade)",
              imageData: studentPerformanceChart ? studentPerformanceChart.toBase64Image() : null
            },
            {
              title: "Module Pass/Fail Mix (%)",
              imageData: modulePerformanceChart ? modulePerformanceChart.toBase64Image() : null
            }
          ],
          headers: ["Student", "Registration", "Batch", "Average", "Best", "Pass", "Fail"],
          rows
        });
      });

      if (apiDownloadPdfBtn) apiDownloadPdfBtn.addEventListener("click", () => {
        const report = lastAiReport;
        if (!report || !report.summary) {
          showWarningNotification("Generate the AI accuracy report first.");
          return;
        }

        const summary = report.summary || {};
        const rows = (report.outliers || []).map((o) => [
          o.student_name || "-",
          o.registration_number || "-",
          o.exam_name || "-",
          toNum(o.api_score).toFixed(2),
          toNum(o.lecturer_grade).toFixed(2),
          toNum(o.score_diff).toFixed(2),
          toNum(o.abs_diff).toFixed(2)
        ]);

        openPrintReport({
          title: "AI Accuracy Report",
          subtitle: "Comparison between AI score and lecturer score for published workflow.",
          metadataPairs: buildReportHeaderPairs({ report, reportType: "ai" }),
          summaryPairs: [
            ["Samples", toNum(summary.sample_count)],
            ["MAE", toNum(summary.mae).toFixed(2)],
            ["RMSE", toNum(summary.rmse).toFixed(2)],
            ["Within Tolerance", `${toNum(summary.within_tolerance_rate).toFixed(2)}%`]
          ],
          chartBlocks: [
            {
              title: "Criteria Acceptable Rate (%)",
              imageData: aiCriteriaChart ? aiCriteriaChart.toBase64Image() : null
            },
            {
              title: "AI vs Lecturer Score Gap",
              imageData: aiAgreementChart ? aiAgreementChart.toBase64Image() : null
            }
          ],
          headers: ["Student", "Registration", "Exam", "AI", "Lecturer", "Diff", "Abs Diff"],
          rows
        });
      });
    }

    document.addEventListener("DOMContentLoaded", async () => {
      bindReportUiHandlers();
      switchReportTab("batch");

      const user = await requireAuth("lecturer");
      if (!user) return;
      currentLecturerName = user.fullName
        || `${user.firstName || ""} ${user.lastName || ""}`.trim()
        || user.name
        || "Lecturer";

      await loadModulesIntoFilters();
      await onBatchGenerate(null, { silentSuccess: true });
    });
  