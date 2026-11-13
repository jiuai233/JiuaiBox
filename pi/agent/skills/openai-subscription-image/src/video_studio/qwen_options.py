"""Lightweight Qwen CLI options, independent of Colab and generation runtimes."""
from pathlib import Path

NATIVE_OPTIONS = ('qwen_profile', 'qwen_lora_strength', 'qwen_variant', 'seed', 'width', 'height',
                  'steps', 'cfg', 'sampler_name', 'scheduler', 'gpu', 'qwen_timeout', 'session')


def add_options(command, *, resources=True):
    command.add_argument('--qwen-profile', choices=('clean', 'half', 'lora-0.8'),
                         help='Qwen technical preset from config/qwen-runtime.json; not a content rating')
    command.add_argument('--qwen-lora-strength', type=float,
                         help='Override the selected Qwen LoRA strength; requires a LoRA-enabled Base profile')
    command.add_argument('--qwen-variant', choices=('turbo', 'base'), help='Qwen only: Turbo sigma/cache chain or Base KSampler')
    command.add_argument('--seed', type=int, help='Qwen unsigned 64-bit seed; default from config/qwen-runtime.json')
    command.add_argument('--width', type=int, help='Qwen text-to-image canvas, multiple of 32; edits follow reference 1')
    command.add_argument('--height', type=int, help='Qwen text-to-image canvas, multiple of 32; edits follow reference 1')
    command.add_argument('--steps', type=int, help='Qwen Base only')
    command.add_argument('--cfg', type=float, help='Qwen Base only')
    command.add_argument('--sampler-name', choices=('euler', 'er_sde'), help='Qwen Base only')
    command.add_argument('--scheduler', choices=('simple', 'beta'), help='Qwen Base only')
    command.add_argument('--qwen-timeout', type=float, help='Qwen monitoring deadline in seconds; expiry keeps the original handle')
    if resources:
        command.add_argument('--gpu', help='Optional assertion: must match the explicitly held Qwen session GPU')
        command.add_argument('--session', type=Path,
                             help='Held Qwen session directory or session.json. Create explicitly with qwen_cli session-create; submit never allocates or releases.')
