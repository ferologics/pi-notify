#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(pwd)"
OUTPUT_NAME="context-dump.txt"
BUDGET=272000
TMP_OUTPUT=false
WITH_DOCS=true
WITH_TESTS=true
INCLUDE_LOCKFILES=false
INCLUDE_ENV=false
INCLUDE_SECRETS=false
NO_CLIPBOARD=false
FAIL_OVER_BUDGET=false
INSTALL_TOOLS=false

show_help() {
    cat <<'EOF'
Prepare an LLM-ready code dump and token-count it with o200k-base.

Usage:
    prepare-context.sh [project_dir] [options]

Options:
    --output <name>           Output filename (default: context-dump.txt)
    --tmp-output              Write output into /tmp/context-packer/... instead of <project_dir>/prompt
    --budget <tokens>         Token budget threshold (default: 272000)
    --with-docs               Include docs/ directory (default: on)
    --with-tests              Include test files (__tests__, tests/, test/, *.test.*, *.spec.*, etc.) (default: on)
    --no-docs                 Exclude docs/ directory
    --no-tests                Exclude test files (__tests__, tests/, test/, *.test.*, *.spec.*, etc.)
    --include-lockfiles       Include lockfiles (pnpm-lock.yaml, Cargo.lock, etc.)
    --include-env             Include env files (.env, .env.*, .envrc) (default: off)
    --include-secrets         Include potentially sensitive files (.npmrc, keys/certs, etc.) (default: off)
    --no-clipboard            Do not place final output into clipboard
    --fail-over-budget        Exit with code 2 when tokens exceed budget
    --install-tools           Install missing tools (tokencount via cargo)
    -h, --help                Show this help

Examples:
    prepare-context.sh ~/dev/pui
    prepare-context.sh ~/dev/pui --no-docs --no-tests
    prepare-context.sh ~/dev/pui --include-env --include-secrets
    prepare-context.sh ~/dev/pui --budget 272000 --output pui-gpt5.txt
EOF
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

is_allowed_extension() {
    local rel="$1"
    case "$rel" in
        *.rs|*.zig|*.c|*.h|*.cpp|*.hpp|*.cc|*.hh|*.m|*.mm|*.swift|*.kt|*.kts|*.java|*.py|*.go|*.rb|*.php|*.cs|*.fs|*.lua|*.r|\
        *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.svelte|*.vue|\
        *.css|*.scss|*.sass|*.less|*.html|*.htm|*.svg|*.xml|*.xsd|*.xsl|\
        *.json|*.jsonc|*.toml|*.yaml|*.yml|*.ini|*.cfg|*.conf|*.properties|\
        *.md|*.mdx|*.rst|*.txt|\
        *.sh|*.bash|*.zsh|*.fish|*.ps1|\
        *.sql|*.graphql|*.gql|*.proto|*.tf|*.tfvars|*.cmake|*.gradle)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

is_explicit_include() {
    local rel="$1"
    local base
    base="$(basename "$rel")"

    case "$base" in
        Dockerfile|Containerfile|Makefile|GNUmakefile|justfile|Justfile|Procfile|Procfile.*|\
        Brewfile|Gemfile|Gemfile.*|Rakefile|Rakefile.*|Vagrantfile|\
        CMakeLists.txt|meson.build|meson_options.txt|BUILD|BUILD.bazel|WORKSPACE|WORKSPACE.bazel|MODULE.bazel|\
        Jenkinsfile|Tiltfile|Podfile|Cartfile|Fastfile|flake.nix|default.nix|shell.nix|Taskfile)
            return 0
            ;;
        .editorconfig|.gitignore|.gitattributes|.dockerignore|\
        .npmrc|.nvmrc|.prettierignore|.prettierrc|.eslintignore|\
        .tool-versions|.python-version|.ruby-version|.node-version|.terraform.lock.hcl)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

is_lockfile() {
    local rel="$1"
    case "$rel" in
        pnpm-lock.yaml|*/pnpm-lock.yaml|\
        package-lock.json|*/package-lock.json|\
        yarn.lock|*/yarn.lock|\
        bun.lock|*/bun.lock|bun.lockb|*/bun.lockb|\
        npm-shrinkwrap.json|*/npm-shrinkwrap.json|\
        Cargo.lock|*/Cargo.lock|\
        composer.lock|*/composer.lock|\
        Gemfile.lock|*/Gemfile.lock|\
        poetry.lock|*/poetry.lock|\
        Pipfile.lock|*/Pipfile.lock)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

is_env_path() {
    local rel="$1"
    case "$rel" in
        .env|.env.*|*/.env|*/.env.*|.envrc|*/.envrc)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

is_secret_path() {
    local rel="$1"
    local base
    base="$(basename "$rel")"

    case "$rel" in
        .npmrc|*/.npmrc|.pypirc|*/.pypirc|.netrc|*/.netrc|\
        .aws/credentials|*/.aws/credentials|.aws/config|*/.aws/config|\
        .gem/credentials|*/.gem/credentials)
            return 0
            ;;
    esac

    case "$base" in
        id_rsa|id_dsa|id_ecdsa|id_ed25519|\
        google-services.json|GoogleService-Info.plist|\
        firebase-adminsdk*.json|*service-account*.json|*serviceaccount*.json)
            return 0
            ;;
    esac

    case "$rel" in
        *.pem|*.key|*.p12|*.pfx|*.jks|*.keystore|*.kdbx|*.pkcs12|*.der|*.crt|*.cer|*.csr|\
        *.mobileprovision|*.provisionprofile)
            return 0
            ;;
    esac

    return 1
}

is_docs_path() {
    local rel="$1"
    case "$rel" in
        docs/*|*/docs/*|doc/*|*/doc/*|documentation/*|*/documentation/*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

is_test_path() {
    local rel="$1"
    case "$rel" in
        __tests__/*|*/__tests__/*|\
        test/*|*/test/*|tests/*|*/tests/*|\
        *.test.*|*.spec.*|*_test.*|test_*.py)
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
        .git/*|*/.git/*|.hg/*|*/.hg/*|.svn/*|*/.svn/*|\
        node_modules/*|*/node_modules/*|\
        prompt/*|*/prompt/*|\
        dist/*|*/dist/*|build/*|*/build/*|target/*|*/target/*|out/*|*/out/*|coverage/*|*/coverage/*|\
        .next/*|*/.next/*|.nuxt/*|*/.nuxt/*|.svelte-kit/*|*/.svelte-kit/*|.turbo/*|*/.turbo/*|\
        .cache/*|*/.cache/*|.parcel-cache/*|*/.parcel-cache/*|\
        .venv/*|*/.venv/*|venv/*|*/venv/*|\
        __pycache__/*|*/__pycache__/*|.pytest_cache/*|*/.pytest_cache/*|.mypy_cache/*|*/.mypy_cache/*|\
        .terraform/*|*/.terraform/*|.direnv/*|*/.direnv/*|\
        .gradle/*|*/.gradle/*|.idea/*|*/.idea/*|\
        *.egg-info/*|*/*.egg-info/*)
            return 0
            ;;
    esac

    case "$rel" in
        .DS_Store|*/.DS_Store|*CHATGPT_CODE_DUMP*|*code-dump*.txt)
            return 0
            ;;
    esac

    if [[ "$INCLUDE_LOCKFILES" != true ]] && is_lockfile "$rel"; then
        return 0
    fi

    if [[ "$INCLUDE_ENV" != true ]] && is_env_path "$rel"; then
        return 0
    fi

    if [[ "$INCLUDE_SECRETS" != true ]] && is_secret_path "$rel"; then
        return 0
    fi

    return 1
}

is_included_file() {
    local rel="$1"

    if [[ "$WITH_DOCS" != true ]] && is_docs_path "$rel"; then
        return 1
    fi

    if [[ "$WITH_TESTS" != true ]] && is_test_path "$rel"; then
        return 1
    fi

    if [[ "$INCLUDE_LOCKFILES" == true ]] && is_lockfile "$rel"; then
        return 0
    fi

    if [[ "$INCLUDE_ENV" == true ]] && is_env_path "$rel"; then
        return 0
    fi

    if [[ "$INCLUDE_SECRETS" == true ]] && is_secret_path "$rel"; then
        return 0
    fi

    if is_explicit_include "$rel"; then
        return 0
    fi

    if is_allowed_extension "$rel"; then
        return 0
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
        --tmp-output)
            TMP_OUTPUT=true
            shift
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
        --no-docs)
            WITH_DOCS=false
            shift
            ;;
        --no-tests)
            WITH_TESTS=false
            shift
            ;;
        --include-lockfiles)
            INCLUDE_LOCKFILES=true
            shift
            ;;
        --include-env)
            INCLUDE_ENV=true
            shift
            ;;
        --include-secrets)
            INCLUDE_SECRETS=true
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

if [[ "$INCLUDE_ENV" == true || "$INCLUDE_SECRETS" == true ]]; then
    echo "⚠️ Including potentially sensitive files (env/secrets)" >&2
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

    if is_included_file "$rel"; then
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

if [[ "$TMP_OUTPUT" == true ]]; then
    project_slug="$(basename "$PROJECT_DIR" | tr ' ' '-' | tr -cd '[:alnum:]._-')"
    timestamp="$(date +%Y%m%d-%H%M%S)"
    OUTPUT_DIR="/tmp/context-packer/${project_slug}-${timestamp}"
else
    OUTPUT_DIR="$PROJECT_DIR/prompt"
fi

mkdir -p "$OUTPUT_DIR"

OUTPUT_PATH="$OUTPUT_DIR/$OUTPUT_NAME"
MANIFEST_PATH="$OUTPUT_DIR/${OUTPUT_NAME%.txt}.files.txt"

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
echo "📂 Out dir:   $OUTPUT_DIR"
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
