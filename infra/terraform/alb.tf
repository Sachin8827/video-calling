resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids

  enable_deletion_protection = false
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-api-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "instance"

  health_check {
    path                = "/" 
    healthy_threshold   = 2
    unhealthy_threshold = 10
    timeout             = 5
    interval            = 10
    matcher             = "200,404" 
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
