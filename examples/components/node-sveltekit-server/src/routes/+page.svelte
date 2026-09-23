<script lang="ts">
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
    <title>Daymark — a tiny TODO list</title>
    <meta
        name="description"
        content="A minimal SvelteKit TODO application running inside a WebAssembly component."
    />
</svelte:head>

<main>
    <section class="workspace" aria-labelledby="page-title">
        <header>
            <div class="mark" aria-hidden="true">D</div>
            <div class="heading">
                <p class="eyebrow">Today · Jco component</p>
                <h1 id="page-title">Make space for what matters.</h1>
            </div>
            <div class="count" aria-label={`${data.stats.open} open tasks`}>
                <strong>{data.stats.open}</strong>
                <span>open</span>
            </div>
        </header>

        <form class="composer" method="POST" action="?/add">
            <label for="title">Add a task</label>
            <div class="composer-row">
                <input
                    id="title"
                    name="title"
                    placeholder="What needs your attention?"
                    maxlength="80"
                    value={form?.title ?? ''}
                    autocomplete="off"
                    required
                />
                <button type="submit">Add task</button>
            </div>
            {#if form?.message}
                <p class="message" role="alert">{form.message}</p>
            {/if}
        </form>

        <div class="list-heading">
            <h2>Your list</h2>
            <span>{data.stats.completed} completed</span>
        </div>

        {#if data.todos.length}
            <ul class="todos">
                {#each data.todos as todo (todo.id)}
                    <li class:done={todo.done}>
                        <form method="POST" action="?/toggle">
                            <input type="hidden" name="id" value={todo.id} />
                            <button
                                class="toggle"
                                type="submit"
                                aria-label={todo.done ? `Mark ${todo.title} as open` : `Complete ${todo.title}`}
                            >
                                <span aria-hidden="true">{todo.done ? '✓' : ''}</span>
                            </button>
                        </form>

                        <span class="todo-title">{todo.title}</span>

                        <form method="POST" action="?/remove">
                            <input type="hidden" name="id" value={todo.id} />
                            <button class="remove" type="submit" aria-label={`Delete ${todo.title}`}>×</button>
                        </form>
                    </li>
                {/each}
            </ul>
        {:else}
            <div class="empty">
                <span aria-hidden="true">✓</span>
                <h2>All clear.</h2>
                <p>Add something when you are ready.</p>
            </div>
        {/if}

        <footer>
            <span>SvelteKit · adapter-node · jco-std</span>
            {#if data.stats.completed}
                <form method="POST" action="?/clearCompleted">
                    <button type="submit">Clear completed</button>
                </form>
            {/if}
        </footer>
    </section>
</main>

<style>
    :global(*) {
        box-sizing: border-box;
    }

    :global(html) {
        color-scheme: light;
        font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #eee9df;
        color: #24231f;
    }

    :global(body) {
        margin: 0;
        min-width: 320px;
        min-height: 100vh;
        background:
            radial-gradient(circle at 12% 8%, rgba(255, 255, 255, 0.9), transparent 32rem),
            linear-gradient(135deg, #f6f2ea 0%, #e9e3d8 100%);
    }

    :global(button),
    :global(input) {
        font: inherit;
    }

    :global(button) {
        cursor: pointer;
    }

    main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 3rem 1.25rem;
    }

    .workspace {
        width: min(100%, 44rem);
        overflow: hidden;
        border: 1px solid rgba(50, 46, 38, 0.1);
        border-radius: 1.75rem;
        background: rgba(255, 253, 248, 0.94);
        box-shadow:
            0 2rem 5rem rgba(55, 48, 35, 0.12),
            0 0.15rem 0.5rem rgba(55, 48, 35, 0.06);
    }

    header {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: start;
        gap: 1rem;
        padding: 2.25rem 2.25rem 1.75rem;
    }

    .mark {
        display: grid;
        place-items: center;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 0.85rem;
        background: #24231f;
        color: #fffdf8;
        font-family: Georgia, serif;
        font-size: 1.25rem;
        font-style: italic;
    }

    .heading {
        min-width: 0;
    }

    .eyebrow {
        margin: 0.15rem 0 0.45rem;
        color: #837d70;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.13em;
        text-transform: uppercase;
    }

    h1 {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(1.7rem, 5vw, 2.35rem);
        font-weight: 500;
        letter-spacing: -0.035em;
        line-height: 1.08;
    }

    .count {
        min-width: 3.75rem;
        padding: 0.55rem 0.7rem;
        border-radius: 0.9rem;
        background: #e8efe8;
        color: #3d694d;
        text-align: center;
    }

    .count strong,
    .count span {
        display: block;
    }

    .count strong {
        font-family: Georgia, serif;
        font-size: 1.35rem;
        line-height: 1;
    }

    .count span {
        margin-top: 0.2rem;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    .composer {
        margin: 0 2.25rem 2rem;
        padding: 1rem;
        border-radius: 1rem;
        background: #f3efe6;
    }

    .composer label {
        display: block;
        margin: 0 0 0.55rem 0.15rem;
        color: #716b5f;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    .composer-row {
        display: flex;
        gap: 0.65rem;
    }

    .composer input {
        min-width: 0;
        flex: 1;
        border: 1px solid #d9d2c4;
        border-radius: 0.75rem;
        outline: none;
        background: #fffdf8;
        padding: 0.85rem 1rem;
        color: #24231f;
        transition: border-color 120ms ease, box-shadow 120ms ease;
    }

    .composer input:focus {
        border-color: #6c8f75;
        box-shadow: 0 0 0 3px rgba(108, 143, 117, 0.16);
    }

    .composer input::placeholder {
        color: #aaa396;
    }

    .composer button {
        border: 0;
        border-radius: 0.75rem;
        background: #d86545;
        padding: 0.75rem 1.15rem;
        color: white;
        font-weight: 750;
        box-shadow: 0 0.35rem 0.8rem rgba(174, 71, 43, 0.18);
    }

    .message {
        margin: 0.7rem 0.15rem 0;
        color: #a23f2b;
        font-size: 0.85rem;
    }

    .list-heading {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        padding: 0 2.35rem 0.65rem;
    }

    .list-heading h2 {
        margin: 0;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    .list-heading span {
        color: #8a8478;
        font-size: 0.78rem;
    }

    .todos {
        margin: 0;
        padding: 0 1.5rem 0.75rem;
        list-style: none;
    }

    .todos li {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 0.9rem;
        min-height: 3.65rem;
        border-top: 1px solid #ece7dc;
        padding: 0.55rem 0.75rem;
    }

    .todos li:last-child {
        border-bottom: 1px solid #ece7dc;
    }

    .toggle {
        display: grid;
        place-items: center;
        width: 1.45rem;
        height: 1.45rem;
        border: 1.5px solid #c9c2b5;
        border-radius: 50%;
        background: transparent;
        color: white;
        font-size: 0.8rem;
        font-weight: 800;
    }

    .done .toggle {
        border-color: #668873;
        background: #668873;
    }

    .todo-title {
        line-height: 1.35;
    }

    .done .todo-title {
        color: #999286;
        text-decoration: line-through;
        text-decoration-color: #b6afa2;
    }

    .remove {
        border: 0;
        background: transparent;
        padding: 0.25rem 0.5rem;
        color: #aaa397;
        font-size: 1.35rem;
        line-height: 1;
    }

    .remove:hover,
    .remove:focus-visible {
        color: #b74c35;
    }

    .empty {
        padding: 2.5rem 2rem 3rem;
        text-align: center;
    }

    .empty > span {
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        margin: 0 auto 0.8rem;
        border-radius: 50%;
        background: #e8efe8;
        color: #4c765b;
    }

    .empty h2,
    .empty p {
        margin: 0;
    }

    .empty h2 {
        font-family: Georgia, serif;
        font-weight: 500;
    }

    .empty p {
        margin-top: 0.35rem;
        color: #837d70;
    }

    footer {
        min-height: 3.6rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        border-top: 1px solid #e6e0d5;
        background: #f8f5ee;
        padding: 0.85rem 2.25rem;
        color: #8a8478;
        font-size: 0.72rem;
        letter-spacing: 0.035em;
    }

    footer button {
        border: 0;
        background: transparent;
        padding: 0.35rem 0;
        color: #716b5f;
        font-size: 0.75rem;
        font-weight: 650;
    }

    @media (max-width: 560px) {
        main {
            display: block;
            padding: 0;
        }

        .workspace {
            min-height: 100vh;
            border: 0;
            border-radius: 0;
        }

        header {
            grid-template-columns: auto 1fr;
            padding: 1.5rem 1.25rem;
        }

        .count {
            display: none;
        }

        .composer {
            margin: 0 1.25rem 1.75rem;
        }

        .composer-row {
            flex-direction: column;
        }

        .list-heading {
            padding-inline: 1.35rem;
        }

        .todos {
            padding-inline: 0.55rem;
        }

        footer {
            padding-inline: 1.25rem;
        }
    }

    @media (prefers-reduced-motion: no-preference) {
        .workspace {
            animation: arrive 420ms ease-out both;
        }

        @keyframes arrive {
            from {
                opacity: 0;
                transform: translateY(0.75rem);
            }
        }
    }
</style>
