<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte';

  export interface LiquidTabItem {
    id: string;
    label: string;
    icon?: IconName;
    badge?: boolean;
  }

  interface Props {
    items: LiquidTabItem[];
    activeId: string;
    ariaLabel: string;
    onSelect: (id: string) => void;
    variant?: 'tabs' | 'navigation' | 'segmented';
    className?: string;
  }

  let {
    items,
    activeId,
    ariaLabel,
    onSelect,
    variant = 'tabs',
    className = '',
  }: Props = $props();

  let root = $state<HTMLElement | null>(null);
  let buttons = $state<(HTMLButtonElement | undefined)[]>([]);
  let box = $state({ left: 0, top: 0, width: 0, height: 0 });
  let positioned = $state(false);
  let dragging = $state(false);
  let dragTarget = $state<string | null>(null);
  /** Biến dạng nhẹ theo hướng kéo: giãn theo trục kéo, ép trục còn lại, nghiêng rất ít. */
  let warp = $state({ scaleX: 1, scaleY: 1, skew: 0 });

  let pointerId: number | null = null;
  let startX = 0;
  let startLeft = 0;
  let minLeft = 0;
  let maxLeft = 0;
  let dragFrame = 0;
  let pendingLeft: number | null = null;
  let didDrag = false;
  let suppressClick = false;

  function getBox(index: number) {
    const container = root;
    const button = buttons[index];
    if (container === null || button === undefined) return null;
    const outer = container.getBoundingClientRect();
    const target = button.getBoundingClientRect();
    const styles = getComputedStyle(container);
    const horizontalInset = Number.parseFloat(styles.getPropertyValue('--tab-indicator-inset-x')) || 0;
    const verticalInset = Number.parseFloat(styles.getPropertyValue('--tab-indicator-inset-y')) || 0;
    return {
      left: target.left - outer.left - container.clientLeft + horizontalInset,
      top: target.top - outer.top - container.clientTop + verticalInset,
      width: Math.max(0, target.width - horizontalInset * 2),
      height: Math.max(0, target.height - verticalInset * 2),
    };
  }

  function measure(): void {
    const index = items.findIndex((item) => item.id === activeId);
    if (index < 0) return;
    const next = getBox(index);
    if (next === null) return;
    box = next;
    positioned = true;
  }

  function resetWarp(): void {
    warp = { scaleX: 1, scaleY: 1, skew: 0 };
  }

  /**
   * Giới hạn lớp kính trong đúng dải tab.
   *
   * Lấy mép trái của tab đầu và mép trái của tab cuối làm hai đầu: lớp kính cùng
   * bề rộng với tab đang chọn, nên "trái tab đầu → trái tab cuối" là toàn bộ dải
   * hợp lệ. Kéo quá hai đầu thì lớp kính dừng ở mép, không trượt ra ngoài khung.
   */
  function measureDragBounds(): void {
    const first = getBox(0);
    const last = getBox(items.length - 1);
    minLeft = first?.left ?? 0;
    maxLeft = last?.left ?? Math.max(minLeft, (root?.clientWidth ?? 0) - box.width);
  }

  const indicatorStyle = $derived(
    `--indicator-left:${box.left}px;--indicator-top:${box.top}px;--indicator-width:${box.width}px;--indicator-height:${box.height}px;transform:translate3d(${box.left}px,${box.top}px,0) scale(${warp.scaleX},${warp.scaleY}) skewX(${warp.skew}deg)`,
  );

  $effect(() => {
    // Re-measure when the selected tab, list or layout changes (including rotation).
    void activeId;
    void items.length;
    const container = root;
    if (container === null) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const button of buttons) if (button !== undefined) observer.observe(button);
    return () => observer.disconnect();
  });

  function tabAt(centerX: number): number {
    for (let index = 0; index < buttons.length; index += 1) {
      const button = buttons[index];
      if (button === undefined) continue;
      const rect = button.getBoundingClientRect();
      if (centerX >= rect.left && centerX <= rect.right) return index;
    }
    return -1;
  }

  function onPointerDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const handle = target.closest('.liquid-tabs__indicator') !== null;
    const activeTab = target.closest<HTMLButtonElement>('button[data-tab-id]')?.dataset.tabId === activeId;
    if (!handle && !activeTab) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startLeft = box.left;
    measureDragBounds();
    didDrag = false;
    dragTarget = activeId;
    root?.setPointerCapture(event.pointerId);
  }

  function tabAtIndicatorLeft(left: number): number {
    const container = root;
    if (container === null) return -1;
    const rect = container.getBoundingClientRect();
    return tabAt(rect.left + container.clientLeft + left + box.width / 2);
  }

  function onPointerMove(event: PointerEvent): void {
    if (pointerId !== event.pointerId) return;
    const delta = event.clientX - startX;
    if (!didDrag && Math.abs(delta) < 5) return;
    didDrag = true;
    dragging = true;
    if (event.cancelable) event.preventDefault();
    const next = Math.min(maxLeft, Math.max(minLeft, startLeft + delta));
    pendingLeft = next;
    const moved = next - startLeft;
    const stretch = Math.min(Math.abs(moved) / 520, 0.07);
    warp = {
      scaleX: 1 + stretch,
      scaleY: 1 - stretch * 0.65,
      skew: Math.max(-2.2, Math.min(2.2, moved / 120)),
    };
    if (dragFrame !== 0) return;
    dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      if (pendingLeft === null) return;
      box = { ...box, left: pendingLeft };
      const index = tabAtIndicatorLeft(pendingLeft);
      dragTarget = index < 0 ? null : (items[index]?.id ?? null);
    });
  }

  function finishPointer(event: PointerEvent): void {
    if (pointerId !== event.pointerId) return;
    const wasDrag = didDrag;
    if (dragFrame !== 0) cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    if (pendingLeft !== null && wasDrag) {
      box = { ...box, left: pendingLeft };
      const index = tabAtIndicatorLeft(pendingLeft);
      dragTarget = index < 0 ? null : (items[index]?.id ?? null);
    }
    pendingLeft = null;
    const targetId = dragTarget;
    pointerId = null;
    didDrag = false;
    dragging = false;
    dragTarget = null;
    resetWarp();
    if (wasDrag) {
      suppressClick = true;
      window.setTimeout(() => (suppressClick = false), 0);
      const index = targetId === null ? -1 : items.findIndex((item) => item.id === targetId);
      if (index >= 0 && items[index]?.id !== activeId) {
        onSelect(items[index]!.id);
      } else {
        const selectedIndex = items.findIndex((item) => item.id === activeId);
        const next = getBox(selectedIndex);
        if (next !== null) box = next;
      }
    } else {
      measure();
    }
    if (root?.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
  }

  function cancelPointer(event: PointerEvent): void {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    const wasDrag = didDrag;
    if (dragFrame !== 0) cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    pendingLeft = null;
    didDrag = false;
    dragging = false;
    dragTarget = null;
    resetWarp();
    if (wasDrag) {
      const index = items.findIndex((item) => item.id === activeId);
      const next = getBox(index);
      if (next !== null) box = next;
    }
  }

  function bindEvents(node: HTMLElement) {
    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', finishPointer);
    node.addEventListener('pointercancel', cancelPointer);
    node.addEventListener('keydown', onKeydown);

    return {
      destroy() {
        node.removeEventListener('pointerdown', onPointerDown);
        node.removeEventListener('pointermove', onPointerMove);
        node.removeEventListener('pointerup', finishPointer);
        node.removeEventListener('pointercancel', cancelPointer);
        node.removeEventListener('keydown', onKeydown);
      },
    };
  }

  function activate(index: number): void {
    const item = items[index];
    if (item === undefined) return;
    onSelect(item.id);
    buttons[index]?.focus();
  }

  function onKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const current = target.closest<HTMLButtonElement>('button[data-tab-id]');
    if (current === null) return;
    const index = items.findIndex((item) => item.id === current.dataset.tabId);
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    activate(next);
  }

  function select(item: LiquidTabItem): void {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    onSelect(item.id);
  }
</script>

{#snippet tabItems()}
  <span
    class="liquid-tabs__indicator"
    class:is-positioned={positioned}
    class:is-dragging={dragging}
    aria-hidden="true"
    style={indicatorStyle}
  ></span>
  {#each items as item, index (item.id)}
    <button
      bind:this={buttons[index]}
      type="button"
      data-tab-id={item.id}
      role={variant === 'tabs' ? 'tab' : undefined}
      aria-selected={variant === 'tabs' ? item.id === activeId : undefined}
      aria-current={variant === 'navigation' && item.id === activeId ? 'page' : undefined}
      tabindex={variant === 'tabs' && item.id !== activeId ? -1 : undefined}
      class:is-drag-target={dragTarget === item.id && item.id !== activeId}
      aria-pressed={variant === 'segmented' ? item.id === activeId : undefined}
      onclick={() => select(item)}
    >
      {#if item.icon !== undefined}<Icon name={item.icon} size={21} />{/if}
      <span>{item.label}</span>
      {#if item.badge}<span class="liquid-tabs__badge" aria-hidden="true"></span>{/if}
    </button>
  {/each}
{/snippet}

{#if variant === 'navigation' || variant === 'segmented'}
  <div
    class="liquid-tabs {variant === 'navigation' ? 'liquid-tabs--navigation' : 'liquid-tabs--segmented'} {className}"
    bind:this={root}
    role="group"
    tabindex="-1"
    aria-label={ariaLabel}
    style="--tab-count: {items.length}"
    use:bindEvents
  >
    {@render tabItems()}
  </div>
{:else}
  <div
    class="liquid-tabs {className}"
    role="tablist"
    tabindex="-1"
    aria-label={ariaLabel}
    style="--tab-count: {items.length}"
    bind:this={root}
    use:bindEvents
  >
    {@render tabItems()}
  </div>
{/if}
