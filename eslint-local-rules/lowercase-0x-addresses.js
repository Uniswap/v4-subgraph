/**
 * ESLint rule to ensure all strings starting with "0x" are lowercase
 * This is important for Ethereum addresses and hash strings
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure all strings starting with "0x" are lowercase',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: 'code',
    messages: {
      uppercaseHexString: 'Hex string starting with "0x" must be lowercase. Found: "{{value}}"',
    },
    schema: [],
  },

  create(context) {
    return {
      Literal(node) {
        // Check if the node is a string literal
        if (typeof node.value === 'string') {
          const value = node.value

          // Check if string starts with "0x"
          if (value.startsWith('0x')) {
            // Check if there are any uppercase letters after "0x"
            const hasUppercase = /[A-F]/.test(value)

            if (hasUppercase) {
              context.report({
                node,
                messageId: 'uppercaseHexString',
                data: {
                  value,
                },
                fix(fixer) {
                  // Auto-fix by converting to lowercase
                  const lowercased = value.toLowerCase()
                  // Preserve the quote style (single or double)
                  const quote = node.raw[0]
                  return fixer.replaceText(node, `${quote}${lowercased}${quote}`)
                },
              })
            }
          }
        }
      },
    }
  },
}
