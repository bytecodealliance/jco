import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

interface Todo {
    id: number;
    title: string;
    done: boolean;
}

let nextId = 4;

const todos: Todo[] = [
    { id: 1, title: 'Read the component model notes', done: true },
    { id: 2, title: 'Ship a tiny SvelteKit app', done: false },
    { id: 3, title: 'Take the afternoon offline', done: false },
];

function todoId(form: FormData): number | undefined {
    const id = Number(form.get('id'));

    return Number.isSafeInteger(id) ? id : undefined;
}

export const load: PageServerLoad = () => {
    const completed = todos.filter((todo) => todo.done).length;

    return {
        todos,
        stats: {
            completed,
            open: todos.length - completed,
        },
    };
};

export const actions = {
    async add({ request }) {
        const form = await request.formData();
        const title = String(form.get('title') ?? '').trim();

        if (!title) {
            return fail(400, { title, message: 'Give this task a short, useful name.' });
        }

        if (title.length > 80) {
            return fail(400, { title, message: 'Keep tasks to 80 characters or fewer.' });
        }

        todos.push({ id: nextId++, title, done: false });

        return { created: true };
    },

    async toggle({ request }) {
        const form = await request.formData();
        const todo = todos.find((item) => item.id === todoId(form));

        if (!todo) {
            return fail(404, { message: 'That task is no longer available.' });
        }

        todo.done = !todo.done;

        return { updated: true };
    },

    async remove({ request }) {
        const form = await request.formData();
        const index = todos.findIndex((item) => item.id === todoId(form));

        if (index === -1) {
            return fail(404, { message: 'That task is no longer available.' });
        }

        todos.splice(index, 1);

        return { removed: true };
    },

    clearCompleted() {
        for (let index = todos.length - 1; index >= 0; index--) {
            if (todos[index]?.done) {
                todos.splice(index, 1);
            }
        }

        return { cleared: true };
    },
} satisfies Actions;
