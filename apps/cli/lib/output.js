function displayValue(value) {
	if (value === null || value === undefined) return '';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

function truncate(value, length = 80) {
	const text = displayValue(value).replace(/\s+/g, ' ');
	return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export class OutputWriter {
	constructor({ stdout = process.stdout, stderr = process.stderr, secrets = [] } = {}) {
		this.stdout = stdout;
		this.stderr = stderr;
		this.secrets = secrets.filter(Boolean);
	}

	addSecret(secret) {
		if (secret && !this.secrets.includes(secret)) this.secrets.push(secret);
	}

	write(value, { pretty = false, table = false } = {}) {
		if (table) return this.writeText(this.renderTable(value));
		return this.writeText(JSON.stringify(value === undefined ? null : value, null, pretty ? 2 : 0));
	}

	writeError(error, { pretty = false } = {}) {
		const payload = { error: { code: error.code, message: error.message } };
		if (error.details !== undefined) payload.error.details = error.details;
		this.stderr.write(`${this.redact(JSON.stringify(payload, null, pretty ? 2 : 0))}\n`);
	}

	writeText(value) {
		this.stdout.write(`${this.redact(String(value))}\n`);
	}

	redact(value) {
		let output = value;
		for (const secret of this.secrets) output = output.split(secret).join('[REDACTED]');
		return output;
	}

	renderTable(value) {
		const rows = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).map(([key, item]) => ({ key, value: item })) : [{ value }];
		if (!rows.length) return '(no results)';
		const objects = rows.map((row) => row && typeof row === 'object' && !Array.isArray(row) ? row : { value: row });
		const preferred = ['id', 'name', 'title', 'subject', 'status', 'mailbox', 'project_id', 'description'];
		const keys = [...new Set(objects.flatMap((row) => Object.keys(row)))];
		const columns = [...preferred.filter((key) => keys.includes(key)), ...keys.filter((key) => !preferred.includes(key))].slice(0, 8);
		const widths = columns.map((column) => Math.max(column.length, ...objects.map((row) => truncate(row[column]).length)));
		const line = (row) => columns.map((column, index) => truncate(row[column]).padEnd(widths[index])).join('  ').trimEnd();
		return [line(Object.fromEntries(columns.map((column) => [column, column]))), widths.map((width) => '-'.repeat(width)).join('  '), ...objects.map(line)].join('\n');
	}
}

