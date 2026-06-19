data "aws_iam_policy_document" "ecs_task_execution_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution_role" {
  name               = "${var.project_name}-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.project_name}-task"
  network_mode             = "host" # Required for MediaSoup UDP ports to map easily
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  cpu                      = "1024"
  memory                   = "900"

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "node:20-bookworm" # Note: in production, replace with your actual ECR image url
      cpu       = 512
      memory    = 512
      essential = true
      command   = ["sh", "-c", "export MEDIASOUP_ANNOUNCED_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4) && npm install && npm run start:prod"]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "DATABASE_URL", value = "postgresql://${aws_db_instance.postgres.username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/${aws_db_instance.postgres.db_name}" },
        { name = "REDIS_URL", value = "redis://127.0.0.1:6379" },
        { name = "JWT_SECRET", value = var.jwt_secret },
        { name = "ALLOWED_ORIGIN", value = var.domain_name != "" ? "https://${var.domain_name}" : "*" },
        { name = "TURN_SERVER_URL", value = "turn:127.0.0.1:3478" },
        { name = "TURN_USERNAME", value = "turnuser" },
        { name = "TURN_CREDENTIAL", value = var.turn_credential },
        { name = "MEDIASOUP_LISTEN_IP", value = "0.0.0.0" },
        { name = "MEDIASOUP_MIN_PORT", value = "40000" },
        { name = "MEDIASOUP_MAX_PORT", value = "49999" }
      ]
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]
    },
    {
      name      = "redis"
      image     = "redis:7-alpine"
      cpu       = 256
      memory    = 256
      essential = true
      command   = ["redis-server", "--maxmemory", "128mb", "--maxmemory-policy", "allkeys-lru"]
    },
    {
      name      = "coturn"
      image     = "coturn/coturn:latest"
      cpu       = 256
      memory    = 128
      essential = true
      # Default coturn command is fine, we just need to ensure the configuration file is present or use env vars
    }
  ])
}

resource "aws_ecs_service" "main" {
  name            = "${var.project_name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_capacity = 1
  
  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight            = 100
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }
  
  depends_on = [aws_lb_listener.http]
}
