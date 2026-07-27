(function (global) {
  'use strict';

  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 44;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const encoder = new TextEncoder();

  const COLORS = {
    ink: [0.09, 0.12, 0.18],
    muted: [0.38, 0.43, 0.52],
    line: [0.82, 0.85, 0.90],
    pale: [0.95, 0.97, 0.99],
    accent: [0.27, 0.20, 0.78],
    accentSoft: [0.93, 0.92, 1.00],
    white: [1, 1, 1],
    warning: [0.63, 0.20, 0.16]
  };

  function ascii(value) {
    return String(value ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/\u00D7/g, 'x')
      .replace(/\u00B7/g, '-')
      .replace(/[^\x20-\x7E]/g, '');
  }

  function pdfEscape(value) {
    return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function byteLength(value) {
    return encoder.encode(value).length;
  }

  function colorCmd(color, stroke = false) {
    return `${color.map(n => Number(n).toFixed(3)).join(' ')} ${stroke ? 'RG' : 'rg'}`;
  }

  function measureText(text, size, bold = false) {
    let units = 0;
    for (const char of ascii(text)) {
      if (char === ' ') units += 0.28;
      else if ('ilI.,:;!|\'`'.includes(char)) units += 0.25;
      else if ('MW@%&'.includes(char)) units += 0.90;
      else if ('0123456789'.includes(char)) units += 0.56;
      else if (char === '-' || char === '/' || char === '\\') units += 0.36;
      else units += bold ? 0.56 : 0.52;
    }
    return units * size;
  }

  function wrapText(text, width, size, bold = false) {
    const clean = ascii(text).replace(/\s+/g, ' ').trim();
    if (!clean) return [''];
    const words = clean.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measureText(candidate, size, bold) <= width) {
        line = candidate;
      } else if (!line) {
        let chunk = '';
        for (const char of word) {
          if (measureText(chunk + char, size, bold) > width && chunk) {
            lines.push(chunk);
            chunk = char;
          } else chunk += char;
        }
        line = chunk;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function formatDate(iso, long = false) {
    if (!iso) return '-';
    const date = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return ascii(iso);
    return date.toLocaleDateString('en-US', long
      ? { month: 'long', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(iso) {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return ascii(iso);
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function formatMinutes(seconds) {
    if (!Number.isFinite(Number(seconds))) return '0';
    return String(Math.max(0, Math.round(Number(seconds) / 60)));
  }

  function setPlan(set) {
    if (set?.seconds != null) return `${set.seconds} sec`;
    const weight = set?.weight === 'BW' ? 'BW' : `${set?.weight ?? '-'} lb`;
    return `${weight} x ${set?.reps ?? '-'}`;
  }

  function setActual(set) {
    if (set?.seconds != null || set?.actualSeconds != null) return `${set?.actualSeconds ?? set?.seconds ?? 0} sec`;
    const value = set?.actualWeight ?? set?.weight;
    const weight = value === 'BW' ? 'BW' : `${value ?? '-'} lb`;
    return `${weight} x ${set?.actualReps ?? set?.reps ?? '-'}`;
  }

  function completedSets(workout) {
    return (workout?.exercises || []).reduce((total, exercise) => total + (exercise.sets || []).filter(set => set.completed).length, 0);
  }

  function completedReps(workout) {
    return (workout?.exercises || []).reduce((total, exercise) => total + (exercise.sets || [])
      .filter(set => set.completed && set.seconds == null && set.actualSeconds == null)
      .reduce((sum, set) => sum + Number(set.actualReps ?? set.reps ?? 0), 0), 0);
  }

  function timedSeconds(workout) {
    return (workout?.exercises || []).reduce((total, exercise) => total + (exercise.sets || [])
      .filter(set => set.completed && (set.seconds != null || set.actualSeconds != null))
      .reduce((sum, set) => sum + Number(set.actualSeconds ?? set.seconds ?? 0), 0), 0);
  }

  class ReportCanvas {
    constructor(options = {}) {
      this.pages = [];
      this.cursorY = MARGIN;
      this.section = options.section || 'ForgeFit Progress Statement';
      this.period = options.period || 'All recorded activity';
      this.generated = options.generated || formatDateTime(new Date().toISOString());
      this.pageHeader = options.pageHeader !== false;
    }

    newPage(section = this.section, header = this.pageHeader) {
      this.section = section;
      const page = { commands: [], section };
      this.pages.push(page);
      this.page = page;
      this.cursorY = MARGIN;
      if (header) this.drawPageHeader();
      return page;
    }

    drawPageHeader() {
      this.text('FORGEFIT', MARGIN, 37, { size: 9, bold: true, color: COLORS.accent });
      this.text(this.section, PAGE_W - MARGIN, 37, { size: 8, align: 'right', color: COLORS.muted });
      this.line(MARGIN, 45, PAGE_W - MARGIN, 45, COLORS.line, 0.8);
      this.cursorY = 63;
    }

    command(command) {
      this.page.commands.push(command);
    }

    text(value, x, y, options = {}) {
      const size = options.size || 10;
      const bold = Boolean(options.bold);
      const color = options.color || COLORS.ink;
      const align = options.align || 'left';
      const clean = ascii(value);
      let tx = x;
      if (align === 'right') tx -= measureText(clean, size, bold);
      if (align === 'center') tx -= measureText(clean, size, bold) / 2;
      const py = PAGE_H - y;
      this.command(`q\n${colorCmd(color)}\nBT\n/${bold ? 'F2' : 'F1'} ${size.toFixed(2)} Tf\n1 0 0 1 ${tx.toFixed(2)} ${py.toFixed(2)} Tm\n(${pdfEscape(clean)}) Tj\nET\nQ`);
    }

    paragraph(value, x, y, width, options = {}) {
      const size = options.size || 9;
      const bold = Boolean(options.bold);
      const lineHeight = options.lineHeight || size * 1.35;
      const lines = wrapText(value, width, size, bold);
      lines.forEach((line, index) => this.text(line, x, y + index * lineHeight, options));
      return lines.length * lineHeight;
    }

    rect(x, y, width, height, options = {}) {
      const fill = options.fill;
      const stroke = options.stroke;
      const lineWidth = options.lineWidth || 0.7;
      const py = PAGE_H - y - height;
      const commands = ['q'];
      if (fill) commands.push(colorCmd(fill));
      if (stroke) commands.push(colorCmd(stroke, true), `${lineWidth.toFixed(2)} w`);
      commands.push(`${x.toFixed(2)} ${py.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`);
      commands.push(fill && stroke ? 'B' : fill ? 'f' : 'S', 'Q');
      this.command(commands.join('\n'));
    }

    line(x1, y1, x2, y2, color = COLORS.line, width = 0.7) {
      this.command(`q\n${colorCmd(color, true)}\n${width.toFixed(2)} w\n${x1.toFixed(2)} ${(PAGE_H - y1).toFixed(2)} m\n${x2.toFixed(2)} ${(PAGE_H - y2).toFixed(2)} l\nS\nQ`);
    }

    ensureSpace(height, section = this.section) {
      if (!this.page) this.newPage(section);
      if (this.cursorY + height > PAGE_H - 48) this.newPage(section);
    }

    spacer(amount = 10) {
      this.cursorY += amount;
    }

    title(title, subtitle = '') {
      this.ensureSpace(subtitle ? 62 : 45);
      this.text(title, MARGIN, this.cursorY + 2, { size: 20, bold: true });
      this.cursorY += 27;
      if (subtitle) {
        this.cursorY += this.paragraph(subtitle, MARGIN, this.cursorY, CONTENT_W, { size: 9, color: COLORS.muted });
      }
      this.cursorY += 10;
    }

    sectionTitle(title, subtitle = '') {
      this.ensureSpace(subtitle ? 52 : 36);
      this.text(title, MARGIN, this.cursorY, { size: 14, bold: true, color: COLORS.ink });
      this.cursorY += 18;
      if (subtitle) this.cursorY += this.paragraph(subtitle, MARGIN, this.cursorY, CONTENT_W, { size: 8.5, color: COLORS.muted });
      this.cursorY += 8;
    }

    callout(label, value, x, y, width) {
      this.rect(x, y, width, 54, { fill: COLORS.pale, stroke: COLORS.line });
      this.text(label.toUpperCase(), x + 10, y + 17, { size: 7, bold: true, color: COLORS.muted });
      this.text(value, x + 10, y + 39, { size: 15, bold: true, color: COLORS.ink });
    }

    table(columns, rows, options = {}) {
      const fontSize = options.fontSize || 7.8;
      const headerSize = options.headerSize || fontSize;
      const padX = options.padX || 4;
      const padY = options.padY || 4;
      const lineHeight = fontSize * 1.28;
      const headerHeight = options.headerHeight || 24;
      const section = options.section || this.section;
      const repeatHeader = options.repeatHeader !== false;
      const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
      const startX = options.x || MARGIN;

      const drawHeader = () => {
        this.ensureSpace(headerHeight + 20, section);
        let x = startX;
        columns.forEach(col => {
          this.rect(x, this.cursorY, col.width, headerHeight, { fill: COLORS.ink, stroke: COLORS.white, lineWidth: 0.3 });
          const lines = wrapText(col.label, col.width - padX * 2, headerSize, true).slice(0, 2);
          lines.forEach((line, i) => this.text(line, x + padX, this.cursorY + 10 + i * headerSize, { size: headerSize, bold: true, color: COLORS.white }));
          x += col.width;
        });
        this.cursorY += headerHeight;
      };

      drawHeader();
      rows.forEach((row, rowIndex) => {
        const wrapped = columns.map((col, index) => wrapText(row[index] ?? '', col.width - padX * 2, fontSize, Boolean(col.bold)));
        const maxLines = Math.max(1, ...wrapped.map(lines => lines.length));
        const rowHeight = Math.max(options.minRowHeight || 20, padY * 2 + maxLines * lineHeight);
        if (this.cursorY + rowHeight > PAGE_H - 48) {
          this.newPage(section);
          if (repeatHeader) drawHeader();
        }
        let x = startX;
        columns.forEach((col, index) => {
          this.rect(x, this.cursorY, col.width, rowHeight, {
            fill: rowIndex % 2 ? COLORS.pale : COLORS.white,
            stroke: COLORS.line,
            lineWidth: 0.35
          });
          wrapped[index].forEach((line, lineIndex) => {
            const y = this.cursorY + padY + fontSize + lineIndex * lineHeight;
            let tx = x + padX;
            if (col.align === 'right') tx = x + col.width - padX;
            if (col.align === 'center') tx = x + col.width / 2;
            this.text(line, tx, y, {
              size: fontSize,
              bold: Boolean(col.bold),
              color: col.color || COLORS.ink,
              align: col.align || 'left'
            });
          });
          x += col.width;
        });
        this.cursorY += rowHeight;
      });
      this.line(startX, this.cursorY, startX + totalWidth, this.cursorY, COLORS.line, 0.7);
      this.cursorY += options.after || 12;
    }
  }

  function summarize(payload) {
    const { state, exerciseMap = {} } = payload;
    const history = [...(state.history || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.startedAt).localeCompare(String(b.startedAt)));
    const dates = history.map(item => item.date).filter(Boolean);
    const checkinDates = Object.keys(state.checkins || {});
    const allDates = [...dates, ...checkinDates].sort();
    const periodStart = allDates[0] || state.createdAt || state.baselineStart || new Date().toISOString().slice(0, 10);
    const periodEnd = allDates[allDates.length - 1] || new Date().toISOString().slice(0, 10);
    const totals = {
      workouts: history.length,
      sets: history.reduce((sum, item) => sum + completedSets(item), 0),
      reps: history.reduce((sum, item) => sum + completedReps(item), 0),
      timedSeconds: history.reduce((sum, item) => sum + timedSeconds(item), 0),
      minutes: history.reduce((sum, item) => sum + Number(item.durationSec || 0), 0) / 60,
      painFree: history.filter(item => Number(item.painLevel || 0) === 0).length
    };

    const monthly = new Map();
    const groups = new Map();
    const exercises = new Map();

    history.forEach(workout => {
      const month = String(workout.date || '').slice(0, 7) || 'Unknown';
      const monthRow = monthly.get(month) || { month, workouts: 0, sets: 0, reps: 0, minutes: 0, painTotal: 0 };
      monthRow.workouts += 1;
      monthRow.sets += completedSets(workout);
      monthRow.reps += completedReps(workout);
      monthRow.minutes += Number(workout.durationSec || 0) / 60;
      monthRow.painTotal += Number(workout.painLevel || 0);
      monthly.set(month, monthRow);

      (workout.exercises || []).forEach(exercise => {
        const catalog = exerciseMap[exercise.id] || {};
        const groupName = catalog.group || 'Other';
        const group = groups.get(groupName) || { group: groupName, sets: 0, reps: 0, seconds: 0, maxWeight: 0, bodyweight: false, last: '' };
        const key = exercise.id || exercise.name || 'unknown';
        const summary = exercises.get(key) || {
          id: key,
          name: catalog.name || exercise.name || key,
          group: groupName,
          sessions: new Set(),
          sets: 0,
          reps: 0,
          seconds: 0,
          maxWeight: 0,
          bodyweight: false,
          last: ''
        };
        summary.sessions.add(workout.id || `${workout.date}-${workout.name}`);
        summary.last = !summary.last || String(workout.date) > summary.last ? workout.date : summary.last;
        group.last = !group.last || String(workout.date) > group.last ? workout.date : group.last;
        (exercise.sets || []).filter(set => set.completed).forEach(set => {
          const isTime = set.seconds != null || set.actualSeconds != null;
          group.sets += 1;
          summary.sets += 1;
          if (isTime) {
            const seconds = Number(set.actualSeconds ?? set.seconds ?? 0);
            group.seconds += seconds;
            summary.seconds += seconds;
          } else {
            const reps = Number(set.actualReps ?? set.reps ?? 0);
            group.reps += reps;
            summary.reps += reps;
            const weight = set.actualWeight ?? set.weight;
            if (weight === 'BW') {
              group.bodyweight = true;
              summary.bodyweight = true;
            } else {
              group.maxWeight = Math.max(group.maxWeight, Number(weight || 0));
              summary.maxWeight = Math.max(summary.maxWeight, Number(weight || 0));
            }
          }
        });
        groups.set(groupName, group);
        exercises.set(key, summary);
      });
    });

    return {
      history,
      periodStart,
      periodEnd,
      totals,
      monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
      groups: [...groups.values()].sort((a, b) => b.sets - a.sets || a.group.localeCompare(b.group)),
      exercises: [...exercises.values()].sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
    };
  }

  function addCover(canvas, summary, payload) {
    canvas.newPage('Complete Fitness Record', false);
    canvas.rect(0, 0, PAGE_W, 174, { fill: COLORS.ink });
    canvas.rect(MARGIN, 46, 48, 48, { fill: COLORS.accent });
    canvas.text('F', MARGIN + 24, 80, { size: 25, bold: true, color: COLORS.white, align: 'center' });
    canvas.text('FORGEFIT', MARGIN + 62, 65, { size: 10, bold: true, color: COLORS.white });
    canvas.text('PROGRESS STATEMENT', MARGIN + 62, 88, { size: 22, bold: true, color: COLORS.white });
    canvas.text('Complete fitness activity record', MARGIN + 62, 111, { size: 9, color: [0.78, 0.82, 0.90] });
    canvas.text(`Generated ${formatDateTime(new Date().toISOString())}`, PAGE_W - MARGIN, 65, { size: 8, color: [0.78, 0.82, 0.90], align: 'right' });
    canvas.text(`App version ${ascii(payload.state.version || payload.appVersion || '-')}`, PAGE_W - MARGIN, 82, { size: 8, color: [0.78, 0.82, 0.90], align: 'right' });

    canvas.cursorY = 211;
    canvas.text('STATEMENT PERIOD', MARGIN, canvas.cursorY, { size: 8, bold: true, color: COLORS.muted });
    canvas.text(`${formatDate(summary.periodStart, true)} through ${formatDate(summary.periodEnd, true)}`, MARGIN, canvas.cursorY + 25, { size: 16, bold: true });
    canvas.cursorY += 62;

    const gap = 10;
    const cardW = (CONTENT_W - gap * 2) / 3;
    canvas.callout('Completed workouts', String(summary.totals.workouts), MARGIN, canvas.cursorY, cardW);
    canvas.callout('Completed sets', String(summary.totals.sets), MARGIN + cardW + gap, canvas.cursorY, cardW);
    canvas.callout('Active minutes', String(Math.round(summary.totals.minutes)), MARGIN + (cardW + gap) * 2, canvas.cursorY, cardW);
    canvas.cursorY += 76;

    canvas.sectionTitle('What this statement contains');
    const contents = [
      'Activity summary and monthly totals',
      'Training volume by muscle group and exercise',
      'Readiness check-ins and recovery information',
      'A workout directory with PDF page references',
      'Every completed workout, exercise, set, planned target, and actual result',
      'Custom presets, unfinished workout data, schedule, equipment, and app settings'
    ];
    contents.forEach((item, index) => {
      canvas.rect(MARGIN, canvas.cursorY - 11, 18, 18, { fill: COLORS.accentSoft, stroke: COLORS.line });
      canvas.text(String(index + 1), MARGIN + 9, canvas.cursorY + 2, { size: 8, bold: true, color: COLORS.accent, align: 'center' });
      canvas.cursorY += canvas.paragraph(item, MARGIN + 28, canvas.cursorY, CONTENT_W - 28, { size: 9 });
      canvas.cursorY += 7;
    });

    canvas.cursorY = 704;
    canvas.rect(MARGIN, canvas.cursorY, CONTENT_W, 44, { fill: COLORS.pale, stroke: COLORS.line });
    canvas.paragraph('Private local export. This report is generated from the data stored in ForgeFit on this device. It is intended for personal review, printing, and backup.', MARGIN + 10, canvas.cursorY + 16, CONTENT_W - 20, { size: 8, color: COLORS.muted });
  }

  function addSummaryPages(canvas, summary) {
    canvas.newPage('Activity Summary');
    canvas.title('Activity summary', 'A statement-style overview of all recorded fitness activity before the detailed workout ledger.');

    const painFreeRate = summary.totals.workouts ? Math.round(summary.totals.painFree / summary.totals.workouts * 100) : 0;
    const metrics = [
      ['Statement start', formatDate(summary.periodStart)],
      ['Statement end', formatDate(summary.periodEnd)],
      ['Completed workouts', summary.totals.workouts],
      ['Completed sets', summary.totals.sets],
      ['Logged repetitions', summary.totals.reps],
      ['Timed movement', `${Math.round(summary.totals.timedSeconds / 60)} min`],
      ['Workout duration', `${Math.round(summary.totals.minutes)} min`],
      ['Pain-free workouts', `${summary.totals.painFree} (${painFreeRate}%)`]
    ];
    canvas.table([
      { label: 'Measure', width: 245, bold: true },
      { label: 'Recorded value', width: 279 }
    ], metrics, { fontSize: 9, minRowHeight: 24, section: 'Activity Summary' });

    canvas.sectionTitle('Monthly activity', 'Each month is summarized using completed workout records.');
    canvas.table([
      { label: 'Month', width: 92, bold: true },
      { label: 'Workouts', width: 74, align: 'right' },
      { label: 'Sets', width: 70, align: 'right' },
      { label: 'Reps', width: 86, align: 'right' },
      { label: 'Minutes', width: 86, align: 'right' },
      { label: 'Avg pain', width: 116, align: 'right' }
    ], summary.monthly.map(row => [
      row.month === 'Unknown' ? row.month : new Date(`${row.month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      row.workouts,
      row.sets,
      row.reps,
      Math.round(row.minutes),
      row.workouts ? (row.painTotal / row.workouts).toFixed(1) : '0.0'
    ]), { fontSize: 8.2, section: 'Activity Summary' });

    canvas.sectionTitle('Training volume by muscle group', 'Bodyweight work is counted in sets and reps but is not converted into a fictional pound value.');
    canvas.table([
      { label: 'Group', width: 102, bold: true },
      { label: 'Sets', width: 60, align: 'right' },
      { label: 'Reps', width: 76, align: 'right' },
      { label: 'Timed min', width: 76, align: 'right' },
      { label: 'Max weight', width: 92, align: 'right' },
      { label: 'Last trained', width: 118, align: 'right' }
    ], summary.groups.map(row => [
      row.group,
      row.sets,
      row.reps,
      (row.seconds / 60).toFixed(1),
      row.maxWeight ? `${row.maxWeight} lb${row.bodyweight ? ' + BW' : ''}` : row.bodyweight ? 'BW' : '-',
      formatDate(row.last)
    ]), { fontSize: 8.1, section: 'Activity Summary' });

    canvas.sectionTitle('Exercise progress register', 'This register lists completed activity only. Planned but skipped sets remain visible later in the workout ledger.');
    canvas.table([
      { label: 'Exercise', width: 160, bold: true },
      { label: 'Group', width: 74 },
      { label: 'Sessions', width: 54, align: 'right' },
      { label: 'Sets', width: 48, align: 'right' },
      { label: 'Reps', width: 55, align: 'right' },
      { label: 'Max', width: 59, align: 'right' },
      { label: 'Last', width: 74, align: 'right' }
    ], summary.exercises.map(row => [
      row.name,
      row.group,
      row.sessions.size,
      row.sets,
      row.reps,
      row.maxWeight ? `${row.maxWeight} lb${row.bodyweight ? ' + BW' : ''}` : row.bodyweight ? 'BW' : row.seconds ? `${Math.round(row.seconds / 60)}m` : '-',
      formatDate(row.last)
    ]), { fontSize: 7.2, section: 'Exercise Progress Register' });
  }

  function addCheckins(canvas, state) {
    const rows = Object.entries(state.checkins || {}).sort(([a], [b]) => a.localeCompare(b));
    canvas.newPage('Readiness Check-ins');
    canvas.title('Readiness check-ins', 'Energy and soreness entries captured before scheduled workouts.');
    if (!rows.length) {
      canvas.paragraph('No readiness check-ins were recorded during this statement period.', MARGIN, canvas.cursorY, CONTENT_W, { size: 10, color: COLORS.muted });
      return;
    }
    canvas.table([
      { label: 'Date', width: 130, bold: true },
      { label: 'Energy (1-5)', width: 120, align: 'right' },
      { label: 'Soreness (0-4)', width: 130, align: 'right' },
      { label: 'Recorded assessment', width: 144 }
    ], rows.map(([date, entry]) => {
      const energy = Number(entry?.energy ?? 3);
      const soreness = Number(entry?.soreness ?? 0);
      let assessment = 'Normal training readiness';
      if (soreness >= 3 || energy <= 2) assessment = 'Recovery or lighter training favored';
      else if (soreness >= 2 || energy === 3) assessment = 'Moderate readiness';
      else if (energy >= 4 && soreness <= 1) assessment = 'Strong readiness';
      return [formatDate(date, true), energy, soreness, assessment];
    }), { fontSize: 8.5, minRowHeight: 24, section: 'Readiness Check-ins' });
  }

  function workoutRows(workout, exerciseMap) {
    const rows = [];
    (workout.exercises || []).forEach((exercise, exerciseIndex) => {
      const catalog = exerciseMap[exercise.id] || {};
      const name = catalog.name || exercise.name || exercise.id || 'Exercise';
      const group = catalog.group || '-';
      const sets = exercise.sets || [];
      if (!sets.length) rows.push([exercise.round ? `R${exercise.round}` : exerciseIndex + 1, name, group, '-', '-', '-', 'No sets', exercise.pain ? 'Yes' : 'No']);
      sets.forEach((set, setIndex) => rows.push([
        exercise.round ? `R${exercise.round}` : exerciseIndex + 1,
        name,
        group,
        setIndex + 1,
        setPlan(set),
        setActual(set),
        set.completed ? 'Completed' : 'Skipped',
        exercise.pain ? 'Yes' : 'No'
      ]));
    });
    return rows;
  }

  function addWorkoutDetails(canvas, workout, number, payload, status = 'Completed') {
    const { exerciseMap = {}, days = {} } = payload;
    const day = days[workout.dayKey]?.label || workout.dayKey || '-';
    canvas.newPage(`Workout ${String(number).padStart(3, '0')}`);
    canvas.title(`Workout ${String(number).padStart(3, '0')}: ${workout.name || day}`, `${status} activity record for ${formatDate(workout.date, true)}.`);

    canvas.table([
      { label: 'Field', width: 138, bold: true },
      { label: 'Recorded value', width: 386 }
    ], [
      ['Workout date', formatDate(workout.date, true)],
      ['Scheduled category', day],
      ['Status', status],
      ['Started', formatDateTime(workout.startedAt)],
      ['Finished', formatDateTime(workout.finishedAt)],
      ['Duration', `${formatMinutes(workout.durationSec)} minutes`],
      ['Overall effort', workout.effort || '-'],
      ['Overall pain', `${Number(workout.painLevel || 0)} / 4`],
      ['Completed sets', completedSets(workout)],
      ['Completed repetitions', completedReps(workout)],
      ['Timed exercise', `${Math.round(timedSeconds(workout) / 60)} minutes`],
      ['Preset reference', workout.presetId || '-'],
      ['Workout record ID', workout.id || '-']
    ], { fontSize: 8.2, minRowHeight: 21, section: `Workout ${String(number).padStart(3, '0')}` });

    canvas.sectionTitle('Exercise and set ledger', 'Planned targets are shown beside the actual values saved when each set was completed.');
    canvas.table([
      { label: '# / Round', width: 42, align: 'center' },
      { label: 'Exercise', width: 132, bold: true },
      { label: 'Group', width: 63 },
      { label: 'Set', width: 34, align: 'center' },
      { label: 'Planned', width: 74 },
      { label: 'Actual', width: 74 },
      { label: 'Status', width: 60 },
      { label: 'Pain flag', width: 45, align: 'center' }
    ], workoutRows(workout, exerciseMap), { fontSize: 6.9, headerSize: 6.8, padX: 3, padY: 3, minRowHeight: 18, section: `Workout ${String(number).padStart(3, '0')}` });
  }

  function createWorkoutDetails(summary, payload) {
    const canvas = new ReportCanvas({ pageHeader: true });
    const starts = [];
    summary.history.forEach((workout, index) => {
      starts.push({
        number: index + 1,
        relativePage: canvas.pages.length + 1,
        workout
      });
      addWorkoutDetails(canvas, workout, index + 1, payload, 'Completed');
    });
    return { pages: canvas.pages, starts };
  }

  function createDirectoryPages(summary, details, payload, prePageCount, assumedDirectoryPages = 0) {
    const canvas = new ReportCanvas({ pageHeader: true });
    canvas.newPage('Workout Directory');
    canvas.title('Workout directory', 'Use the page column to jump from this index to a detailed workout statement.');
    const rows = details.starts.map(item => {
      const workout = item.workout;
      return [
        String(item.number).padStart(3, '0'),
        formatDate(workout.date),
        workout.name || payload.days?.[workout.dayKey]?.label || workout.dayKey,
        completedSets(workout),
        formatMinutes(workout.durationSec),
        workout.effort || '-',
        `${Number(workout.painLevel || 0)}/4`,
        prePageCount + assumedDirectoryPages + item.relativePage
      ];
    });
    if (!rows.length) {
      canvas.paragraph('No completed workouts are available for the directory.', MARGIN, canvas.cursorY, CONTENT_W, { size: 10, color: COLORS.muted });
    } else {
      canvas.table([
        { label: 'No.', width: 36, align: 'center', bold: true },
        { label: 'Date', width: 74 },
        { label: 'Workout', width: 164, bold: true },
        { label: 'Sets', width: 45, align: 'right' },
        { label: 'Min', width: 42, align: 'right' },
        { label: 'Effort', width: 62 },
        { label: 'Pain', width: 44, align: 'right' },
        { label: 'Page', width: 57, align: 'right', bold: true }
      ], rows, { fontSize: 7.2, section: 'Workout Directory' });
    }
    return canvas.pages;
  }

  function addPresetAppendix(canvas, payload) {
    const { state, exerciseMap = {}, days = {} } = payload;
    canvas.newPage('Saved Presets and Configuration');
    canvas.title('Saved presets and configuration', 'The final appendix records custom programming, unfinished work, schedule, equipment, and app behavior settings.');

    const presets = state.customPresets || [];
    canvas.sectionTitle('Custom presets');
    if (!presets.length) {
      canvas.paragraph('No custom presets are currently saved.', MARGIN, canvas.cursorY, CONTENT_W, { size: 9, color: COLORS.muted });
      canvas.cursorY += 20;
    }
    presets.forEach((preset, presetIndex) => {
      canvas.ensureSpace(90, 'Saved Presets and Configuration');
      canvas.text(`${presetIndex + 1}. ${preset.name || 'Custom preset'}`, MARGIN, canvas.cursorY, { size: 11, bold: true });
      canvas.cursorY += 17;
      canvas.paragraph(`${days[preset.dayKey]?.label || preset.dayKey || '-'} | ${preset.intensity || 'Custom'} | ${preset.subtitle || ''}`, MARGIN, canvas.cursorY, CONTENT_W, { size: 8, color: COLORS.muted });
      canvas.cursorY += 17;
      canvas.table([
        { label: '#', width: 34, align: 'center' },
        { label: 'Exercise', width: 236, bold: true },
        { label: 'Group', width: 90 },
        { label: 'Default sets', width: 164 }
      ], (preset.exercises || []).map((item, index) => {
        const exercise = exerciseMap[item.id] || {};
        const sets = item.sets || exercise.defaultSets || [];
        return [index + 1, exercise.name || item.id || 'Exercise', exercise.group || '-', sets.map(setPlan).join(' | ') || '-'];
      }), { fontSize: 7.5, section: 'Saved Presets and Configuration' });
    });

    canvas.sectionTitle('Current unfinished workout');
    if (state.currentWorkout) {
      const currentNumber = (state.history || []).length + 1;
      addWorkoutDetails(canvas, state.currentWorkout, currentNumber, payload, 'Unfinished at time of export');
      canvas.newPage('Saved Presets and Configuration');
    } else {
      canvas.paragraph('No unfinished workout was stored when this statement was generated.', MARGIN, canvas.cursorY, CONTENT_W, { size: 9, color: COLORS.muted });
      canvas.cursorY += 24;
    }

    canvas.sectionTitle('Weekly schedule');
    canvas.table([
      { label: 'Day', width: 140, bold: true },
      { label: 'Scheduled category', width: 384 }
    ], (state.schedule || []).map((key, index) => [
      ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][index] || `Day ${index + 1}`,
      days[key]?.label || key
    ]), { fontSize: 9, minRowHeight: 24, section: 'Saved Presets and Configuration' });

    canvas.sectionTitle('Equipment profile');
    canvas.table([
      { label: 'Equipment type', width: 210, bold: true },
      { label: 'Available equipment', width: 314 }
    ], [
      ['Training surface', 'Home workout area'],
      ['Bench', 'Available'],
      ['Bodyweight exercises', 'Available'],
      ['Dumbbells', '5 lb, 10 lb, 15 lb, 20 lb, and 30 lb']
    ], { fontSize: 9, minRowHeight: 24, section: 'Saved Presets and Configuration' });

    canvas.sectionTitle('App record and settings');
    const settingsRows = [
      ['App data version', state.version || payload.appVersion || '-'],
      ['Data record created', formatDate(state.createdAt, true)],
      ['Progression baseline began', formatDate(state.baselineStart, true)],
      ['Theme', state.settings?.theme || '-'],
      ['Automatic rest timer', state.settings?.autoTimer ? 'Enabled' : 'Disabled'],
      ['Confirm before finish', state.settings?.confirmBeforeFinish ? 'Enabled' : 'Disabled'],
      ['Week starts Sunday', state.settings?.weekStartsSunday ? 'Enabled' : 'Disabled'],
      ['Completed workout records', (state.history || []).length],
      ['Readiness check-ins', Object.keys(state.checkins || {}).length],
      ['Custom presets', (state.customPresets || []).length]
    ];
    Object.entries(state.settings || {}).forEach(([key, value]) => {
      if (!['theme', 'autoTimer', 'confirmBeforeFinish', 'weekStartsSunday'].includes(key)) settingsRows.push([key, typeof value === 'object' ? JSON.stringify(value) : String(value)]);
    });
    canvas.table([
      { label: 'Setting or record', width: 230, bold: true },
      { label: 'Stored value', width: 294 }
    ], settingsRows, { fontSize: 8.7, minRowHeight: 23, section: 'Saved Presets and Configuration' });

    canvas.sectionTitle('Statement notes');
    canvas.paragraph('This document is a human-readable export of ForgeFit data. The JSON backup remains the authoritative machine-readable backup for restoring the app. Planned values, skipped sets, and pain flags are preserved in the workout ledger so the report does not silently pretend every intended set occurred.', MARGIN, canvas.cursorY, CONTENT_W, { size: 9, color: COLORS.muted });
  }

  function addFooters(pages, summary) {
    const total = pages.length;
    pages.forEach((page, index) => {
      const commands = page.commands;
      const temp = new ReportCanvas({ pageHeader: false });
      temp.page = { commands };
      temp.line(MARGIN, 758, PAGE_W - MARGIN, 758, COLORS.line, 0.6);
      temp.text(`ForgeFit | ${formatDate(summary.periodStart)} - ${formatDate(summary.periodEnd)}`, MARGIN, 775, { size: 7, color: COLORS.muted });
      temp.text(`Page ${index + 1} of ${total}`, PAGE_W - MARGIN, 775, { size: 7, color: COLORS.muted, align: 'right' });
    });
  }

  function buildPdf(pages, metadata = {}) {
    const objects = [];
    const pageObjectIds = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    pages.forEach((page, index) => {
      const pageId = 5 + index * 2;
      const contentId = pageId + 1;
      pageObjectIds.push(pageId);
      const streamData = `${page.commands.join('\n')}\n`;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${byteLength(streamData)} >>\nstream\n${streamData}endstream`;
    });
    objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] >>`;
    const infoId = 5 + pages.length * 2;
    objects[infoId] = `<< /Title (${pdfEscape(metadata.title || 'ForgeFit Progress Statement')}) /Author (ForgeFit) /Subject (${pdfEscape(metadata.subject || 'Complete fitness activity record')}) /Creator (ForgeFit PWA) /Producer (ForgeFit built-in PDF engine) /CreationDate (D:${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}) >>`;

    let output = '%PDF-1.4\n% ForgeFit PDF Statement\n';
    const offsets = [0];
    for (let id = 1; id <= infoId; id += 1) {
      offsets[id] = byteLength(output);
      output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefOffset = byteLength(output);
    output += `xref\n0 ${infoId + 1}\n`;
    output += '0000000000 65535 f \n';
    for (let id = 1; id <= infoId; id += 1) output += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    output += `trailer\n<< /Size ${infoId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return encoder.encode(output);
  }

  function buildStatement(payload) {
    if (!payload?.state) throw new Error('ForgeFit state was not provided.');
    const summary = summarize(payload);
    const pre = new ReportCanvas({ period: `${formatDate(summary.periodStart)} - ${formatDate(summary.periodEnd)}` });
    addCover(pre, summary, payload);
    addSummaryPages(pre, summary);
    addCheckins(pre, payload.state);

    const details = createWorkoutDetails(summary, payload);
    let directory = createDirectoryPages(summary, details, payload, pre.pages.length, 1);
    if (directory.length !== 1) directory = createDirectoryPages(summary, details, payload, pre.pages.length, directory.length);
    else directory = createDirectoryPages(summary, details, payload, pre.pages.length, directory.length);

    const appendix = new ReportCanvas({ pageHeader: true });
    addPresetAppendix(appendix, payload);

    const pages = [...pre.pages, ...directory, ...details.pages, ...appendix.pages];
    addFooters(pages, summary);
    return {
      bytes: buildPdf(pages, {
        title: 'ForgeFit Progress Statement',
        subject: `${formatDate(summary.periodStart)} through ${formatDate(summary.periodEnd)}`
      }),
      pageCount: pages.length,
      summary
    };
  }

  function saveBytes(filename, bytes) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function exportStatement(payload) {
    const result = buildStatement(payload);
    const date = new Date().toISOString().slice(0, 10);
    saveBytes(`forgefit-progress-statement-${date}.pdf`, result.bytes);
    return result;
  }

  global.ForgeFitPDF = { buildStatement, exportStatement };
})(typeof window !== 'undefined' ? window : globalThis);
