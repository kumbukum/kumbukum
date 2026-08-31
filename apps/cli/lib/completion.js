export class CompletionRenderer {
	constructor(registry) {
		this.registry = registry;
	}

	render(shell) {
		if (shell === 'fish') return this.fish();
		if (shell === 'bash') return this.bash();
		if (shell === 'zsh') return this.zsh();
		return null;
	}

	fish() {
		const lines = ['complete -c streamient-cli -f', "complete -c streamient-cli -l account -r -d 'Select STREAMIENT_CLI_ACCESS_TOKEN_<ALIAS>'", "complete -c streamient-cli -l token-env -r -d 'Read token from an environment variable'"];
		for (const group of this.registry.groups) {
			lines.push(`complete -c streamient-cli -n '__fish_use_subcommand' -a '${group.name}' -d '${group.description}'`);
			lines.push(`complete -c streamient-cli -n '__fish_seen_subcommand_from ${group.name}' -a '${group.commands.map((command) => command.name).join(' ')}'`);
		}
		lines.push("complete -c streamient-cli -n '__fish_use_subcommand' -a 'doctor tools completion'");
		return lines.join('\n');
	}

	bash() {
		const groups = this.registry.groups.map((group) => group.name).join(' ');
		const globalOptions = '--account --token-env --server --project-id --timeout --input --file --pretty --table --yes --help --version';
		const cases = this.registry.groups.map((group) => `    ${group.name}) COMPREPLY=( $(compgen -W "${group.commands.map((command) => command.name).join(' ')}" -- "$cur") ) ;;`).join('\n');
		return `_streamient_cli_complete() {\n  local cur prev\n  COMPREPLY=()\n  cur="\${COMP_WORDS[COMP_CWORD]}"\n  prev="\${COMP_WORDS[1]}"\n  case "$prev" in\n${cases}\n    *) COMPREPLY=( $(compgen -W "${groups} doctor tools completion ${globalOptions}" -- "$cur") ) ;;\n  esac\n}\ncomplete -F _streamient_cli_complete streamient-cli`;
	}

	zsh() {
		const groups = this.registry.groups.map((group) => `'${group.name}:${group.description}'`).join(' ');
		const cases = this.registry.groups.map((group) => `    ${group.name}) _values 'command' ${group.commands.map((command) => `'${command.name}:${command.description}'`).join(' ')} ;;`).join('\n');
		return `#compdef streamient-cli\n_streamient_cli() {\n  if (( CURRENT == 2 )); then\n    _values 'group' ${groups} 'doctor:validate connectivity' 'tools:inspect MCP tools' 'completion:generate shell completion' '--account:select token alias' '--token-env:select token environment'\n    return\n  fi\n  case "$words[2]" in\n${cases}\n  esac\n}\n_streamient_cli`;
	}
}

