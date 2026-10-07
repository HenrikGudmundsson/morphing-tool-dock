import { useState, useSyncExternalStore } from 'react'
import { addTodos, getTodos, removeTodo, subscribeTodos, toggleTodo } from '../todo-store'

// The list itself lives in todo-store, so items the agent adds from a
// typed request show up here the same way as ones added by hand.
export function TodoWidget() {
  const todos = useSyncExternalStore(subscribeTodos, getTodos)
  const [draft, setDraft] = useState('')
  const open = todos.filter((todo) => !todo.done).length

  return (
    <div className="p-4">
      {/* Right padding keeps clear of the corner glyph and pin/close buttons. */}
      <div className="pr-36">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          showTodo
        </p>
        <h3 className="mt-1 text-lg font-semibold">To-do</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {todos.length === 0 ? 'Nothing here yet' : `${open} of ${todos.length} left`}
        </p>
      </div>

      <ul className="mt-3 flex flex-col">
        {todos.map((todo) => (
          <li
            key={todo.id}
            className={`group -mx-2 flex items-center gap-2 rounded-md px-2 py-1 ${
              todo.fresh ? 'todo-added' : ''
            }`}
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => toggleTodo(todo.id)}
                className="size-4 shrink-0 accent-blue-600"
              />
              <span
                className={`min-w-0 break-words ${
                  todo.done ? 'text-neutral-400 line-through dark:text-neutral-600' : ''
                }`}
              >
                {todo.text}
              </span>
            </label>
            <button
              type="button"
              aria-label={`Remove ${todo.text}`}
              onClick={() => removeTodo(todo.id)}
              className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-neutral-400 opacity-0 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          addTodos([draft])
          setDraft('')
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="New to-do item"
          placeholder="Add an item"
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
        >
          Add
        </button>
      </form>
    </div>
  )
}
