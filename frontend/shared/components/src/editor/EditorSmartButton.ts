import { mergeAttributes, Node, nodeInputRule } from '@tiptap/core'

export class EditorSmartButton {
    id: string;
    name: string;
    text: string;
    hint: string;
    deleteMessage?: string

    constructor(options: { id: string, name: string, text: string, hint: string, deleteMessage?: string }) {
        this.id = options.id;
        this.name = options.name;
        this.text = options.text;
        this.hint = options.hint;
        this.deleteMessage = options.deleteMessage;
    }
}


export type SmartButtonNodeOptions = {
    HTMLAttributes: Record<string, any>,
    smartButtons: EditorSmartButton[]
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        smartButtonNode: {
            insertSmartButton: (smartButton: EditorSmartButton) => ReturnType,
        }
    }
}

export const SmartButtonNode = Node.create<SmartButtonNodeOptions>({
    priority: 1000,
    name: 'smartButton',

    addOptions() {
        return {
            HTMLAttributes: {},
            smartButtons: []
        }
    }, 

    group: 'block',

    inline: false,
    selectable: true,
    draggable: true,

    atom: false,
    content: "text*",

    // disallows all marks
    marks: '',
     
    addCommands() {
        return {
            insertSmartButton: (smartButton: EditorSmartButton) => ({ commands }) => {
                return commands.insertContent({ type: this.name, attrs: { id: smartButton.id }, content: [{ type: "text", text: smartButton.text }] })
            },
        }
    },

    addInputRules() {
        return this.options.smartButtons.map(s => {
            return nodeInputRule({
                find: new RegExp(`\\{\\{${s.id}\\}\\}$`),
                type: this.type,
                getAttributes: () => { return { id: s.id } }
            })
        })
    },

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => {
                    if (!attributes.id) {
                        return {}
                    }

                    return {
                        'data-id': attributes.id,
                    }
                },
            },
        }
    },

    parseHTML() {
        return [
            {
                tag: `span[data-type="${this.name}"]`,
            },
        ]
    },

    renderHTML({ node, HTMLAttributes }) {
        const button = this.options.smartButtons.find(s => s.id === node.attrs.id)
        return [
            'span',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            mergeAttributes({ 'data-type': this.name, href: "{{"+(button?.id ?? "")+"}}", class: "button primary" }, this.options.HTMLAttributes, HTMLAttributes),
            0,
        ]
    },

    /**
     * Text when copying to the clipboard
     */
    renderText({ node }) {
        return "{{"+node.attrs.id+"}}"
    },
})