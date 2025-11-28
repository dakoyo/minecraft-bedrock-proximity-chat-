import * as React from "react"
import { cn } from "../../lib/utils"
import { Input } from "./input"

interface CodeInputProps {
    length?: number
    value: string
    onChange: (value: string) => void
    className?: string
}

export function CodeInput({ length = 5, value, onChange, className }: CodeInputProps) {
    const inputs = React.useRef<(HTMLInputElement | null)[]>([])

    const focusInput = (index: number) => {
        const input = inputs.current[index]
        if (input) {
            input.focus()
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const val = e.target.value.toUpperCase()
        if (val.length > 1) {
            // Handle paste or multiple chars if somehow entered
            // But usually we just take the last char if it's a single input
            // Let's handle just the last char entered
            const lastChar = val.slice(-1)
            const newValue = value.split('')
            newValue[index] = lastChar
            onChange(newValue.join(''))

            if (index < length - 1) {
                focusInput(index + 1)
            }
            return
        }

        const newValue = value.split('')
        newValue[index] = val
        onChange(newValue.join(''))

        if (val && index < length - 1) {
            focusInput(index + 1)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if (e.key === 'Backspace') {
            if (!value[index] && index > 0) {
                // If empty and backspace, go back and delete previous
                const newValue = value.split('')
                newValue[index - 1] = ''
                onChange(newValue.join(''))
                focusInput(index - 1)
            } else {
                // Just clear current
                const newValue = value.split('')
                newValue[index] = ''
                onChange(newValue.join(''))
            }
        } else if (e.key === 'ArrowLeft' && index > 0) {
            focusInput(index - 1)
        } else if (e.key === 'ArrowRight' && index < length - 1) {
            focusInput(index + 1)
        }
    }

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault()
        const pastedData = e.clipboardData.getData('text').toUpperCase().slice(0, length)
        onChange(pastedData)

        // Focus the last filled input or the first empty one
        const nextIndex = Math.min(pastedData.length, length - 1)
        focusInput(nextIndex)
    }

    // Ensure value is correct length for rendering
    const valueArray = Array(length).fill('').map((_, i) => value[i] || '')

    return (
        <div className={cn("flex gap-0.5 justify-center", className)}>
            {valueArray.map((char, index) => (
                <Input
                    key={index}
                    ref={el => { inputs.current[index] = el }}
                    className="w-12 h-14 text-center text-2xl font-bold uppercase p-0"
                    value={char}
                    onChange={(e) => handleChange(e, index)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    onPaste={handlePaste}
                    maxLength={1}
                />
            ))}
        </div>
    )
}
