var logger = require('pomelo-logger').getLogger('pomelo', __filename);
var socketCmd = require('../../../models/socketCmd')
var GameConfig = require('../../../models/gameConfig')
var utils = require('../../../util/utils')
var Code = require('../../../../../shared/code');
var redisUtil = require("../../../util/redisUtil");

module.exports = function(app) {
	return new Handler(app);
};

var Handler = function(app) {
	this.app = app;
	this.initSocketCmdConfig();
};

var handler = Handler.prototype;

//客户端发送的socket消息
handler.socketMsg = function(msg, session, next) {
	var self = this;
	if (! self.socketCmdConfig) {
		self.initSocketCmdConfig();
	}

	var msgSocketCmd = msg.socketCmd;
	var processerFun = self.socketCmdConfig[msgSocketCmd]
	if (!! processerFun) {
		processerFun.call(self, msg, session, next);
	} else {
		logger.error('没有找到处理函数, cmd = ' + msgSocketCmd);

		next(null, {
			code: Code.NO_HANDLER,
			msg: "没有找到处理函数"
		})
	}
};

////////////////////////////处理函数begin////////////////////////////
//登录
var login = function(msg, session, next) {
	var self = this;
	var sessionService = self.app.get('sessionService');
	self.app.rpc.auth.authRemote.login(session, msg.udid, self.app.get('serverId'), function (err, res) {
		if (err) {
			logger.error('login error ' + err.stack);
			next(err);
		} else {
			//该mid已经登录了，将第一次登录的人踢出
			var oldSession = sessionService.getByUid(res.mid)
			if( !! oldSession) {
				sessionService.kick(res.mid, "您的账号在其他地方登录");
			}

			session.bind(res.mid);
			session.on('closed', userOffLine.bind(null, self.app));
			next(null, {
				code: Code.OK,
				userData: res,
				gameList: GameConfig.gameList
			});
		}
	});
};

//请求加入场次
var enterGroupLevel = function (msg, session, next) {
	var self = this;
	var mid = session.uid;
	var level = msg.level;
	var serverType = GameConfig.groupServerList[level];

	//检查当前是否在匹配中或者游戏中
	redisUtil.getUserDataByField(mid, "state", function (err, resp) {
		if (err) {
			next(err);
		} else {
			if (resp > 0) {
				//如果当前玩家已经在匹配中，不再处理
				next(null)
			} else {
				//玩家在大厅，进入游戏服务器进行匹配
				self.app.rpc.serverType.roomRemote.enterGroupLevel(session, mid, function (err, res) {
					
				});
			}
		}
	})
};

//拉取个人信息
var requestUserInfo = function (msg, session, next) {

};
////////////////////////////处理函数end////////////////////////////

//用户离线
var userOffLine = function (app, session) {
	console.log("BBBBBBBBBBBBBBBBB 用户离线, mid = " + session.uid);
	if(!session || !session.uid) {
		return;
	}

	app.rpc.auth.authRemote.userOffLine(session, session.uid, app.get('serverId'), null);
};

handler.initSocketCmdConfig = function() {
	var self = this;

	self.socketCmdConfig = {
		[socketCmd.LOGIN]: login,
		[socketCmd.REQUEST_USER_INFO]: requestUserInfo,
		[socketCmd.ENTER_GROUP_LEVEL]: enterGroupLevel,
	};
};