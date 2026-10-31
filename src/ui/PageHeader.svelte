<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    subtitle?: string;
    onBack?: () => void;
  }

  let { title, subtitle, onBack }: Props = $props();
</script>

<header class="page-header">
  {#if onBack}
    <button class="back" type="button" aria-label="Quay lại" onclick={onBack}>
      <Icon name="chevron" size={19} width={2.3} />
    </button>
  {/if}
  <div class="heading">
    <h1>{title}</h1>
    {#if subtitle}<p class="muted">{subtitle}</p>{/if}
  </div>
</header>

<style>
  .page-header {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 2px 0;
  }

  .heading {
    min-width: 0;
  }

  .heading p {
    margin: 4px 0 0;
  }

  .back {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    flex: 0 0 auto;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-1);
    /* Phản hồi chạm: nút lún nhẹ khi nhấn, viền sáng lên khi trỏ vào. Cả hai đều
       là trang trí — hành vi của nút không phụ thuộc vào chúng, và trạng thái đứng
       yên không đổi. */
    transition:
      transform var(--dur-1) var(--ease-out),
      border-color var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }

  .back:active {
    transform: scale(0.92);
  }

  @media (hover: hover) {
    .back:hover {
      border-color: var(--accent-line);
      box-shadow: var(--shadow-2);
    }
  }

  .back > :global(svg) {
    transform: rotate(90deg);
  }
</style>
