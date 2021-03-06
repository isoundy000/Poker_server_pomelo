var logger = require('pomelo-logger').getLogger(__filename);
var pomelo = require('pomelo');
var Consts = require('../consts/consts');
var utils = require('../util/utils');
var redisUtil = require("../util/redisUtil");
var GameConfig = require('../models/gameConfig');
var Code = require('../../../shared/code');

var Room = function (app, opts) {
	this.app = app;
	this.channelService = app.get("channelService");
	this.roomMgrService = app.get("roomMgrService");
	opts = opts || {};
	this.roomIndex = opts.roomIndex || 0;
	this.roomState = Consts.ROOM.STATE.UN_INITED;	//当前房间状态
	this.userList = {}; 							//玩家列表
	this.roomData = {}; 							//房间信息
	this.gameData = {}; 							//游戏数据
	this.channel = null; 							//channel
	this.roomConfig = null; 						//房间配置
};

var pro = Room.prototype;

//初始化房间
pro.initRoom = function (roomConfig) {
	this.roomConfig = roomConfig;

	//生成房间号
	var level = roomConfig.level
	var serverID = this.app.getServerId();
	var serverFlag = GameConfig.gameServerFlag[serverID]
	var roomNum = (level + serverFlag) * 100000 + this.roomIndex;

	//初始化房间数据
	this.roomData.roomNum = roomNum;
	this.roomData.maxPlayerNum = 3;

	//初始化牌局数据

	//初始化channel
	this.channel = this.channelService.getChannel(roomNum, true);

	this.roomState = Consts.ROOM.STATE.INITED;
};

pro.initGameData = function () {

};

//玩家进入房间
pro.enterRoom = function (mid) {
	console.log("玩家进入房间 mid = ", mid);
	var self = this;

	//修改redis中玩家的状态
	redisUtil.enterRoom(mid, self.app.getServerType(), self.app.getServerId(), false, function (err) {
		if (err) {
			logger.error("ddzRoom.enterRoom error");
		} else {
			console.log("修改玩家state等数据");

			//获取玩家信息，添加到用户列表
			redisUtil.getAllUserData(mid, function (err, userDataAll) {
				if (err) {
					logger.error("ddzRoom.enterRoom 获取用户数据失败，mid = ", mid);
				} else {
					console.log("获取玩家所有数据");
					var userData = createUserData.call(self);

					//拷贝玩家数据
					for (var key in userData) {
						if (userDataAll[key] !== undefined) {
							userData[key] = userDataAll[key];
						}
					}

					//初始化玩家的位置
					userData.seatID = getAvailableSeatID.call(self);

					console.log("玩家座位号： ", userData.seatID);

					//将玩家添加进玩家列表
					self.userList[mid] = userData;

					//将玩家添加进channel
					self.channel.add(mid, userDataAll.sid);
				}
			});
		}
	});
};

//玩家请求离开房间
pro.leaveRoom = function (mid, cb) {
	var self = this;

	console.log("玩家离开房间 mid = ", mid);
	if (self.roomData.state === Consts.ROOM.STATE.PLAYING) {
		utils.invokeCallback(cb, null, {
			code: Code.ROOM.GAME_PLAYING,
			msg: "牌局进行中无法退出房间",
		});
		return;
	}

	//将该玩家从channel中踢出
	redisUtil.getUserDataByField(mid, ["sid"], function(err, resp) {
		if (err) {
			logger.error("ddzRoom.leaveRoom 获取玩家sid失败");
		} else {
			self.channel.leave(mid, resp[0]);

			//删除该玩家数据
			delete(self.userList[mid]);
			redisUtil.leaveRoom(mid);

			//如果该房间所有玩家都已经离开，回收该房间
			var playerNum = getPlayerNum.call(self);
			console.log("房间剩余人数 playerNum = ", playerNum);
			if (playerNum === 0) {
				self.clearRoom();
				self.roomMgrService.recycleRoom(self.roomIndex);
			} else {
				//通知其他人该玩家离开
			}

			utils.invokeCallback(cb, null, {
				code: Code.OK,
			});
		}
	});
};

//玩家掉线
pro.userOffline = function (mid) {
	var self = this;

	if (self.roomData.state === Consts.ROOM.STATE.PLAYING) {
		//玩家在游戏中，修改该玩家的在线状态
		var userData = self.userList[mid];
		userData.online = 0;

		//广播该玩家掉线的消息
	} else {
		self.leaveRoom(mid);
	}
};

//清空房间
pro.clearRoom = function () {
	this.channelService.destroyChannel(this.roomData.roomNum);

	this.channel = null;
	this.userList = {};
	this.roomData = {};
	this.gameData = {};
	
	this.roomState = Consts.ROOM.STATE.INITED;
};

//房间是否已经初始化
pro.isRoomInited = function () {
	return this.inited;
};

//房间场次
pro.getGroupLevel = function () {
	return this.roomData.level;
};

//房间号
pro.getRoomNumber = function () {
	return this.roomData.roomNum;
};

//房间是否已满
pro.isRoomFull = function () {
	var playerNum = getPlayerNum.call(this);

	return playerNum === this.maxPlayerNum;
}

//玩家是否在房间中
pro.isUserInRoom = function (mid) {
	utils.printObj(this.userList);

	if (this.userList[mid]) {
		return true;
	}

	return false;
};

/////////////////////////////////////功能函数begin/////////////////////////////////////
//初始化userData
var createUserData = function () {
	var userData = {
		mid: 0,
		nick: "",
		sex: 0,
		gold: 0,
		diamond: 0,
		head_url: "",
		seatID: 0,
		ready: 0,
		online: 1,
	};

	return userData;
}

//获取可用的座位号
var getAvailableSeatID = function () {
	var seatUse = [];

	//将已经被占用的座位添加列表
	for (var mid in this.userList) {
		var userData = thi.userList[mid];
		seatUse[userData.seatID] = true;
	}

	for (var i = 1; i <= this.roomData.maxPlayerNum; i++) {
		if (!seatUse[i]) {
			return i;
		}
	}
}

var getPlayerNum = function () {
	var playerNum = 0;
	for (var mid in this.userList) {
		if (this.userList[mid]) {
			playerNum ++;
		}
	}

	return playerNum;
};
/////////////////////////////////////功能函数end/////////////////////////////////////

module.exports = Room;