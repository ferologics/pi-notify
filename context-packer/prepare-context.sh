#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(pwd)"
OUTPUT_NAME="context-dump.txt"
BUDGET=272000
WITH_DOCS=false
WITH_TESTS=false
INCLUDE_LOCKFILES=false
NO_CLIPBOARD=false
FAIL_OVER_BUDGET=false
INSTALL_TOOLS=false

show_help() {
    cat <<'EOF'
Prepare an LLM-ready code dump and token-count it with o200k-base.

Usage:
    prepare-context.sh [project_dir] [options]

Options:
    --output <name>           Output filename inside <project_dir>/prompt (default: context-dump.txt)
    --budget <tokens>         Token budget threshold (default: 272000)
    --with-docs               Include docs/ directory
    --with-tests              Include test files (__tests__, *.test.*, *.spec.*)
    --include-lockfiles       Include lockfiles (pnpm-lock.yaml, Cargo.lock, etc.)
    --no-clipboard            Do not place final output into clipboard
    --fail-over-budget        Exit with code 2 when tokens exceed budget
    --install-tools           Install missing tools (tokencount via cargo)
    -h, --help                Show this help

Examples:
    prepare-context.sh ~/dev/pui --with-docs
    prepare-context.sh ~/dev/pui --with-docs --budget 272000 --output pui-gpt5.txt
EOF
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

is_allowed_extension() {
    local rel="$1"
    case "$rel" in
        *.rs|*.zig|*.c|*.h|*.cpp|*.hpp|*.m|*.mm|*.swift|*.kt|*.java|*.py|*.go|*.rb|*.php|*.cs|*.lua|\
        *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.svelte|*.vue|\
        *.css|*.scss|*.sass|*.less|*.html|*.htm|*.svg|*.xml|\
        *.json|*.toml|*.yaml|*.yml|*.ini|*.env|\
        *.md|*.txt|\
        *.sh|*.bash|*.zsh|*.fish|\
        *.sql|*.graphql)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

is_explicit_include() {
    local rel="$1"
    case "$rel" in
        package.json|svelte.config.js|tailwind.config.ts|tsconfig.json|vite.config.js|biome.json|dprint.json|components.json|\
        rustfmt.toml|mise.toml|README.md|AGENTS.md|TODO.md|.gitignore|.gitattributes|\
        src-tauri/Cargo.toml|src-tauri/tauri.conf.json|src-tauri/build.rs|src-tauri/capabilities/default.json)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

is_excluded_path() {
    local rel="$1"

    case "$rel" in
        .git/*|node_modules/*|prompt/*|.svelte-kit/*|src-tauri/gen/*|src-tauri/icons/*)
            return 0
            ;;
    esac

    case "$rel" in
        .DS_Store|*/.DS_Store|*CHATGPT_CODE_DUMP*|*code-dump*.txt)
            return 0
            ;;
    esac

    if [[ "$INCLUDE_LOCKFILES" != true ]]; then
        case "$rel" in
            pnpm-lock.yaml|package-lock.json|yarn.lock|Cargo.lock|src-tauri/Cargo.lock)
                return 0
                ;;
        esac
    fi

    if [[ "$WITH_TESTS" != true ]]; then
        case "$rel" in
            *__tests__/*|*.test.*|*.spec.*)
                return 0
                ;;
        esac
    fi

    return 1
}

is_included_by_scope() {
    local rel="$1"

    if is_explicit_include "$rel"; then
        return 0
    fi

    if [[ "$rel" == docs/* ]]; then
        if [[ "$WITH_DOCS" == true ]] && is_allowed_extension "$rel"; then
            return 0
        fi
        return 1
    fi

    if [[ "$rel" == src/* || "$rel" == src-tauri/src/* || "$rel" == runtime/* || "$rel" == scripts/* ]]; then
        if is_allowed_extension "$rel"; then
            return 0
        fi
    fi

    return 1
}

ensure_tokencount() {
    if command_exists tokencount; then
        return 0
    fi

    if [[ "$INSTALL_TOOLS" == true ]]; then
        if ! command_exists cargo; then
            echo "❌ cargo not found; cannot install tokencount" >&2
            return 1
        fi
        echo "ℹ️ Installing tokencount via cargo..." >&2
        cargo install tokencount
    fi

    if ! command_exists tokencount; then
        echo "❌ tokencount not found. Install with: cargo install tokencount" >&2
        return 1
    fi

    return 0
}

copy_output_to_clipboard() {
    local output_path="$1"

    if [[ "$NO_CLIPBOARD" == true ]]; then
        return 0
    fi

    if command_exists pbcopy; then
        pbcopy < "$output_path"
        return 0
    fi

    if command_exists wl-copy; then
        wl-copy < "$output_path"
        return 0
    fi

    echo "ℹ️ Clipboard tool not found (pbcopy/wl-copy). Output file was still written." >&2
    return 0
}

render_dump_file() {
    local output_path="$1"

    : > "$output_path"

    for rel in "${selected_files[@]}"; do
        local src="$PROJECT_DIR/$rel"

        printf '%s\n```\n' "$rel" >> "$output_path"
        cat "$src" >> "$output_path"

        if [[ -s "$src" ]]; then
            local last_char
            last_char="$(tail -c 1 "$src" || true)"
            if [[ "$last_char" != $'\n' ]]; then
                printf '\n' >> "$output_path"
            fi
        fi

        printf '```\n\n' >> "$output_path"
    done
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --output)
            OUTPUT_NAME="$2"
            shift 2
            ;;
        --budget)
            BUDGET="$2"
            shift 2
            ;;
        --with-docs)
            WITH_DOCS=true
            shift
            ;;
        --with-tests)
            WITH_TESTS=true
            shift
            ;;
        --include-lockfiles)
            INCLUDE_LOCKFILES=true
            shift
            ;;
        --no-clipboard)
            NO_CLIPBOARD=true
            shift
            ;;
        --fail-over-budget)
            FAIL_OVER_BUDGET=true
            shift
            ;;
        --install-tools)
            INSTALL_TOOLS=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        -* )
            echo "❌ Unknown option: $1" >&2
            show_help
            exit 1
            ;;
        *)
            PROJECT_DIR="$1"
            shift
            ;;
    esac
done

if [[ ! -d "$PROJECT_DIR" ]]; then
    echo "❌ Project directory not found: $PROJECT_DIR" >&2
    exit 1
fi

PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

if [[ ! "$BUDGET" =~ ^[0-9]+$ ]]; then
    echo "❌ Budget must be an integer: $BUDGET" >&2
    exit 1
fi

ensure_tokencount

declare -a all_files
if git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    while IFS= read -r rel; do
        all_files+=("$rel")
    done < <(git -C "$PROJECT_DIR" ls-files)
else
    while IFS= read -r rel; do
        rel="${rel#./}"
        all_files+=("$rel")
    done < <(cd "$PROJECT_DIR" && find . -type f)
fi

declare -a selected_files
for rel in "${all_files[@]}"; do
    [[ -z "$rel" ]] && continue

    if is_excluded_path "$rel"; then
        continue
    fi

    if is_included_by_scope "$rel"; then
        selected_files+=("$rel")
    fi
done

if [[ ${#selected_files[@]} -eq 0 ]]; then
    echo "❌ No files matched selection rules" >&2
    exit 1
fi

declare -a unique_selected_files
while IFS= read -r rel; do
    unique_selected_files+=("$rel")
done < <(printf '%s\n' "${selected_files[@]}" | LC_ALL=C sort -u)
selected_files=("${unique_selected_files[@]}")

PROMPT_DIR="$PROJECT_DIR/prompt"
mkdir -p "$PROMPT_DIR"

OUTPUT_PATH="$PROMPT_DIR/$OUTPUT_NAME"
MANIFEST_PATH="$PROMPT_DIR/${OUTPUT_NAME%.txt}.files.txt"

render_dump_file "$OUTPUT_PATH"
printf '%s\n' "${selected_files[@]}" > "$MANIFEST_PATH"
copy_output_to_clipboard "$OUTPUT_PATH"

TOKENS_RAW="$(tokencount --encoding o200k-base --include-ext txt "$OUTPUT_PATH")"
TOKENS="$(printf '%s\n' "$TOKENS_RAW" | awk 'NR==1 {print $1}')"

if [[ ! "$TOKENS" =~ ^[0-9]+$ ]]; then
    echo "❌ Failed to parse tokencount output" >&2
    echo "$TOKENS_RAW" >&2
    exit 1
fi

echo ""
echo "✅ Context dump ready"
echo "📁 Project:   $PROJECT_DIR"
echo "📄 Output:    $OUTPUT_PATH"
echo "🧾 Manifest:  $MANIFEST_PATH"
echo "📦 Files:     ${#selected_files[@]}"
echo "🔢 Tokens:    $TOKENS (o200k-base)"
echo "🎯 Budget:    $BUDGET"

if (( TOKENS > BUDGET )); then
    echo "⚠️ Over budget by $((TOKENS - BUDGET)) tokens"
    if [[ "$FAIL_OVER_BUDGET" == true ]]; then
        exit 2
    fi
else
    echo "✅ Within budget by $((BUDGET - TOKENS)) tokens"
fi
