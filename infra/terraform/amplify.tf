resource "aws_amplify_app" "frontend" {
  name       = "${var.project_name}-frontend"
  repository = "https://github.com/your-username/nexus-comms" # Replace with actual repository URL
  
  # OAuth token for GitHub access is needed here. It's usually passed securely as a variable.
  # access_token = var.github_token

  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - cd frontend
            - npm ci
        build:
          commands:
            - env | grep -e NEXT_PUBLIC_ >> .env.production
            - npm run build
      artifacts:
        baseDirectory: frontend/.next
        files:
          - '**/*'
      cache:
        paths:
          - frontend/node_modules/**/*
  EOT

  environment_variables = {
    NEXT_PUBLIC_SOCKET_URL = "http://${aws_lb.main.dns_name}:80/signal"
  }
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.frontend.id
  branch_name = "main"
}
