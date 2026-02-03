#!/bin/bash
set -e

# Defaults
TARGET_MB=5
WIDTH=""
FORMAT=""
QUALITY=85

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --target) TARGET_MB="$2"; shift 2 ;;
        --width) WIDTH="$2"; shift 2 ;;
        --format) FORMAT="$2"; shift 2 ;;
        --quality) QUALITY="$2"; shift 2 ;;
        -h|--help) 
            echo "Usage: compress.sh <input> [output] [options]"
            echo ""
            echo "Options:"
            echo "  --target MB       Target size in MB (default: 5)"
            echo "  --width WIDTH     Scale to width (maintains aspect ratio)"
            echo "  --format FORMAT   Convert to: jpeg, png, heic, tiff"
            echo "  --quality 0-100   JPEG/HEIC quality (default: 85)"
            echo ""
            echo "Examples:"
            echo "  compress.sh photo.png                           # 5MB default"
            echo "  compress.sh photo.png out.png --target 2        # 2MB target"
            echo "  compress.sh photo.png out.jpg --format jpeg     # Convert to JPEG"
            echo "  compress.sh photo.png --width 2000              # Resize to 2000px wide"
            exit 0
            ;;
        -*) echo "Unknown option: $1"; exit 1 ;;
        *) 
            if [[ -z "$INPUT" ]]; then INPUT="$1"
            elif [[ -z "$OUTPUT" ]]; then OUTPUT="$1"
            else echo "Too many arguments"; exit 1
            fi
            shift ;;
    esac
done

if [[ -z "$INPUT" ]]; then
    echo "Usage: compress.sh <input> [output] [options]"
    echo "Run with --help for more info"
    exit 1
fi

if [[ ! -f "$INPUT" ]]; then
    echo "Error: Input file not found: $INPUT"
    exit 1
fi

# Determine output path and extension
INPUT_DIR=$(dirname "$INPUT")
INPUT_BASE=$(basename "$INPUT")
INPUT_NAME="${INPUT_BASE%.*}"
INPUT_EXT="${INPUT_BASE##*.}"

if [[ -n "$FORMAT" ]]; then
    OUT_EXT="$FORMAT"
    [[ "$FORMAT" == "jpeg" ]] && OUT_EXT="jpg"
else
    OUT_EXT="$INPUT_EXT"
fi

if [[ -z "$OUTPUT" ]]; then
    OUTPUT="${INPUT_DIR}/${INPUT_NAME}_compressed.${OUT_EXT}"
fi

# Get current dimensions
ORIG_WIDTH=$(sips -g pixelWidth "$INPUT" 2>/dev/null | tail -1 | awk '{print $2}')
ORIG_HEIGHT=$(sips -g pixelHeight "$INPUT" 2>/dev/null | tail -1 | awk '{print $2}')
ORIG_SIZE=$(stat -f%z "$INPUT")
ORIG_SIZE_MB=$(echo "scale=2; $ORIG_SIZE / 1000000" | bc)

echo "Input: $INPUT"
echo "Dimensions: ${ORIG_WIDTH} × ${ORIG_HEIGHT}"
echo "Size: ${ORIG_SIZE_MB}MB"
echo "Target: ${TARGET_MB}MB"
echo ""

# Target in bytes (using decimal MB to match Finder)
TARGET_BYTES=$(echo "$TARGET_MB * 1000000" | bc | cut -d. -f1)

# Create temp file for working
TEMP_FILE=$(mktemp /tmp/img_compress.XXXXXX)
trap "rm -f '$TEMP_FILE' '$TEMP_FILE'.*" EXIT

# Start with original or format-converted copy
if [[ -n "$FORMAT" ]]; then
    echo "Converting to $FORMAT..."
    sips -s format "$FORMAT" -s formatOptions "$QUALITY" "$INPUT" --out "$TEMP_FILE" >/dev/null 2>&1
    # Rename with correct extension for sips
    mv "$TEMP_FILE" "${TEMP_FILE}.${OUT_EXT}"
    TEMP_FILE="${TEMP_FILE}.${OUT_EXT}"
else
    cp "$INPUT" "$TEMP_FILE"
fi

CURRENT_SIZE=$(stat -f%z "$TEMP_FILE")
CURRENT_WIDTH=$ORIG_WIDTH

# Strip color profile to avoid sips warnings
sips --deleteColorManagementProperties "$TEMP_FILE" --out "$TEMP_FILE" >/dev/null 2>&1 || true

# If user specified width, apply it first
if [[ -n "$WIDTH" ]]; then
    echo "Resizing to width ${WIDTH}..."
    sips --resampleWidth "$WIDTH" "$TEMP_FILE" --out "$TEMP_FILE" >/dev/null 2>&1
    CURRENT_SIZE=$(stat -f%z "$TEMP_FILE")
    CURRENT_WIDTH=$WIDTH
fi

# Check if already under target
if [[ $CURRENT_SIZE -le $TARGET_BYTES ]]; then
    cp "$TEMP_FILE" "$OUTPUT"
    FINAL_SIZE=$(stat -f%z "$OUTPUT")
    FINAL_SIZE_MB=$(echo "scale=2; $FINAL_SIZE / 1000000" | bc)
    FINAL_WIDTH=$(sips -g pixelWidth "$OUTPUT" 2>/dev/null | tail -1 | awk '{print $2}')
    FINAL_HEIGHT=$(sips -g pixelHeight "$OUTPUT" 2>/dev/null | tail -1 | awk '{print $2}')
    echo "Done: $OUTPUT"
    echo "Final: ${FINAL_WIDTH} × ${FINAL_HEIGHT}, ${FINAL_SIZE_MB}MB"
    exit 0
fi

# Binary search for the right width
echo "Finding optimal size..."
MIN_WIDTH=100
MAX_WIDTH=$CURRENT_WIDTH
BEST_WIDTH=$CURRENT_WIDTH

while [[ $((MAX_WIDTH - MIN_WIDTH)) -gt 10 ]]; do
    TRY_WIDTH=$(((MIN_WIDTH + MAX_WIDTH) / 2))
    
    sips --resampleWidth "$TRY_WIDTH" "$TEMP_FILE" --out "${TEMP_FILE}.try" >/dev/null 2>&1
    TRY_SIZE=$(stat -f%z "${TEMP_FILE}.try")
    
    if [[ $TRY_SIZE -le $TARGET_BYTES ]]; then
        BEST_WIDTH=$TRY_WIDTH
        MIN_WIDTH=$TRY_WIDTH
        cp "${TEMP_FILE}.try" "${TEMP_FILE}.best"
    else
        MAX_WIDTH=$TRY_WIDTH
    fi
    
    rm -f "${TEMP_FILE}.try"
done

# Use best result
if [[ -f "${TEMP_FILE}.best" ]]; then
    cp "${TEMP_FILE}.best" "$OUTPUT"
    rm -f "${TEMP_FILE}.best"
else
    # Fallback: just use smallest tried
    sips --resampleWidth "$MIN_WIDTH" "$TEMP_FILE" --out "$OUTPUT" >/dev/null 2>&1
fi

# Report
FINAL_SIZE=$(stat -f%z "$OUTPUT")
FINAL_SIZE_MB=$(echo "scale=2; $FINAL_SIZE / 1000000" | bc)
FINAL_WIDTH=$(sips -g pixelWidth "$OUTPUT" 2>/dev/null | tail -1 | awk '{print $2}')
FINAL_HEIGHT=$(sips -g pixelHeight "$OUTPUT" 2>/dev/null | tail -1 | awk '{print $2}')

echo ""
echo "Done: $OUTPUT"
echo "Final: ${FINAL_WIDTH} × ${FINAL_HEIGHT}, ${FINAL_SIZE_MB}MB"

# Warn if still over target
if [[ $FINAL_SIZE -gt $TARGET_BYTES ]]; then
    echo "Warning: Could not reach target size. Consider converting to JPEG with --format jpeg"
fi
