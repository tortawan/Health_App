# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - heading "Login" [level=1] [ref=e6]
        - button "Need an account?" [ref=e7] [cursor=pointer]
      - paragraph [ref=e8]: Use Supabase email/password auth to protect your food logs. Sessions are stored via HttpOnly cookies for RLS compatibility.
      - generic [ref=e9]:
        - generic [ref=e10]:
          - text: Email
          - textbox "Email" [ref=e11]:
            - /placeholder: you@example.com
            - text: test@example.com
        - generic [ref=e12]:
          - text: Password
          - textbox "Password" [ref=e13]:
            - /placeholder: ••••••••
            - text: password123
        - button "Sign in" [ref=e14] [cursor=pointer]
      - generic [ref=e15]: Invalid login credentials
  - button "Open Next.js Dev Tools" [ref=e21] [cursor=pointer]:
    - img [ref=e22]
  - alert [ref=e25]
```